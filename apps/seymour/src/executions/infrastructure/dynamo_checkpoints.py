"""Monotonic, short-lived execution checkpoints in the shared sessions table."""

import json
import logging
import os
import time

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from src.executions.domain.checkpoint import CHECKPOINT_TTL_SECONDS, Checkpoint, CheckpointScope


def default_client():
    # Same region and endpoint settings as the execution transport; checkpoints are best effort.
    return boto3.client(
        "dynamodb",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
        endpoint_url=os.environ.get("AWS_ENDPOINT_URL"),
        config=Config(connect_timeout=2, read_timeout=3, retries={"max_attempts": 1}),
    )


log = logging.getLogger(__name__)


class DynamoCheckpoints:
    """Failures are logged and treated as a missing checkpoint: they cost a resume, never an answer."""

    def __init__(self, client=None, table=None, clock=time.time):
        self.client = client if client is not None else default_client()
        self.table = (
            table if table is not None else os.environ.get("SESSIONS_TABLE", "papert-sessions")
        )
        self.clock = clock

    def load(self, execution_id: str) -> Checkpoint | None:
        try:
            return self._load(execution_id)
        except Exception:
            log.warning("checkpoint_load_failed", extra={"executionId": execution_id})

            return None

    def save(self, checkpoint: Checkpoint) -> bool:
        try:
            return self._save(checkpoint)
        except Exception:
            log.warning("checkpoint_save_failed", extra={"executionId": checkpoint.execution_id})

            return False

    def delete(self, execution_id: str) -> None:
        # The table's TTL removes a checkpoint that could not be deleted within the hour.
        try:
            self.client.delete_item(
                TableName=self.table,
                Key={"pk": {"S": f"CHECKPOINT#{execution_id}"}, "sk": {"S": "STATE"}},
            )
        except Exception:
            log.warning("checkpoint_delete_failed", extra={"executionId": execution_id})

    def _load(self, execution_id: str) -> Checkpoint | None:
        response = self.client.get_item(
            TableName=self.table,
            Key={"pk": {"S": f"CHECKPOINT#{execution_id}"}, "sk": {"S": "STATE"}},
            ConsistentRead=True,
        )
        item = response.get("Item")
        if item is None or int(item["expires"]["N"]) <= self.clock():
            return None

        scope = CheckpointScope(
            session_id=item["sessionId"]["S"],
            workspace_id=item.get("workspaceId", {}).get("S"),
            conversation_id=item.get("conversationId", {}).get("S"),
        )

        return Checkpoint(
            execution_id=execution_id,
            lease=item["lease"]["S"],
            step=int(item["step"]["N"]),
            scope=scope,
            state=json.loads(item["state"]["S"]),
            source_ids=json.loads(item["sourceIds"]["S"]),
            memory_ids=json.loads(item["memoryIds"]["S"]),
        )

    def _save(self, checkpoint: Checkpoint) -> bool:
        item = {
            "pk": {"S": f"CHECKPOINT#{checkpoint.execution_id}"},
            "sk": {"S": "STATE"},
            "lease": {"S": checkpoint.lease},
            "step": {"N": str(checkpoint.step)},
            "sessionId": {"S": checkpoint.scope.session_id},
            "state": {"S": json.dumps(checkpoint.state, ensure_ascii=False, separators=(",", ":"))},
            "sourceIds": {
                "S": json.dumps(checkpoint.source_ids, ensure_ascii=False, separators=(",", ":"))
            },
            "memoryIds": {
                "S": json.dumps(checkpoint.memory_ids, ensure_ascii=False, separators=(",", ":"))
            },
            "expires": {"N": str(int(self.clock()) + CHECKPOINT_TTL_SECONDS)},
        }
        if checkpoint.scope.workspace_id is not None:
            item["workspaceId"] = {"S": checkpoint.scope.workspace_id}
        if checkpoint.scope.conversation_id is not None:
            item["conversationId"] = {"S": checkpoint.scope.conversation_id}

        encoded = json.dumps(item, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(encoded) > 350_000:
            return False

        try:
            self.client.put_item(
                TableName=self.table,
                Item=item,
                ConditionExpression="attribute_not_exists(pk) OR step < :step",
                ExpressionAttributeValues={":step": {"N": str(checkpoint.step)}},
            )
        except ClientError as error:
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return False

            raise

        return True
