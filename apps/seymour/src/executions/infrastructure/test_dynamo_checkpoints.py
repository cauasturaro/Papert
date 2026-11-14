import json
import os
from dataclasses import asdict, replace
from uuid import uuid4

import boto3
import pytest
from botocore.stub import ANY, Stubber

from src.executions.domain.checkpoint import CHECKPOINT_TTL_SECONDS, Checkpoint, CheckpointScope
from src.executions.domain.execution import Result
from src.executions.infrastructure.dynamo_checkpoints import DynamoCheckpoints, DynamoStagedResults


@pytest.fixture
def client():
    return boto3.client(
        "dynamodb",
        region_name="us-east-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    )


@pytest.fixture
def checkpoint():
    return Checkpoint(
        execution_id="execution",
        lease="lease",
        step=1,
        scope=CheckpointScope("session", "workspace", "conversation"),
        state={"answer": "Olá", "rounds": [1, 2]},
        source_ids=["source"],
        memory_ids=["memory"],
    )


@pytest.fixture
def item():
    return {
        "pk": {"S": "CHECKPOINT#execution"},
        "sk": {"S": "STATE"},
        "lease": {"S": "lease"},
        "step": {"N": "1"},
        "sessionId": {"S": "session"},
        "workspaceId": {"S": "workspace"},
        "conversationId": {"S": "conversation"},
        "state": {"S": '{"answer":"Olá","rounds":[1,2]}'},
        "sourceIds": {"S": '["source"]'},
        "memoryIds": {"S": '["memory"]'},
        "expires": {"N": str(1000 + CHECKPOINT_TTL_SECONDS)},
    }


def put_parameters(item):
    return {
        "TableName": "papert-sessions",
        "Item": item,
        "ConditionExpression": "attribute_not_exists(pk) OR step < :step",
        "ExpressionAttributeValues": {":step": {"N": "1"}},
    }


def get_parameters():
    return {
        "TableName": "papert-sessions",
        "Key": {"pk": {"S": "CHECKPOINT#execution"}, "sk": {"S": "STATE"}},
        "ConsistentRead": True,
    }


@pytest.mark.unit
@pytest.mark.parametrize("optional_scope", [False, True])
def test_round_trip_encoding(client, checkpoint, item, optional_scope):
    if optional_scope:
        checkpoint = replace(
            checkpoint,
            scope=CheckpointScope("session", None, None),
            source_ids=[],
            memory_ids=[],
        )
        del item["workspaceId"]
        del item["conversationId"]
        item["sourceIds"] = {"S": "[]"}
        item["memoryIds"] = {"S": "[]"}

    store = DynamoCheckpoints(client=client, table="papert-sessions", clock=lambda: 1000.9)
    with Stubber(client) as stub:
        stub.add_response("put_item", {}, put_parameters(item))
        stub.add_response("get_item", {"Item": item}, get_parameters())

        saved = store.save(checkpoint)
        restored = store.load(checkpoint.execution_id)

        assert saved is True
        assert restored == checkpoint
        stub.assert_no_pending_responses()


@pytest.mark.unit
def test_conditional_failure_returns_false(client, checkpoint, item):
    store = DynamoCheckpoints(client=client, clock=lambda: 1000)
    with Stubber(client) as stub:
        stub.add_client_error(
            "put_item",
            service_error_code="ConditionalCheckFailedException",
            expected_params=put_parameters(item),
        )

        saved = store.save(checkpoint)

        assert saved is False
        stub.assert_no_pending_responses()


@pytest.mark.unit
def test_store_errors_cost_the_resume_not_the_run(client, checkpoint, item):
    store = DynamoCheckpoints(client=client, clock=lambda: 1000)
    with Stubber(client) as stub:
        stub.add_client_error(
            "put_item",
            service_error_code="ProvisionedThroughputExceededException",
            expected_params=put_parameters(item),
        )
        stub.add_client_error("get_item", service_error_code="InternalServerError")
        stub.add_client_error("delete_item", service_error_code="InternalServerError")

        saved = store.save(checkpoint)
        loaded = store.load(checkpoint.execution_id)
        store.delete(checkpoint.execution_id)

        stub.assert_no_pending_responses()

    assert saved is False
    assert loaded is None


@pytest.mark.unit
def test_oversize_utf8_item_skips_write(client, checkpoint):
    checkpoint = replace(checkpoint, state={"answer": "á" * 175_000})
    store = DynamoCheckpoints(client=client)

    with Stubber(client):
        saved = store.save(checkpoint)

    assert saved is False


@pytest.mark.unit
@pytest.mark.parametrize("expires", [999, 1000])
def test_expired_item_is_ignored(client, item, expires):
    item["expires"] = {"N": str(expires)}
    store = DynamoCheckpoints(client=client, clock=lambda: 1000)
    with Stubber(client) as stub:
        stub.add_response("get_item", {"Item": item}, get_parameters())

        restored = store.load("execution")

        assert restored is None
        stub.assert_no_pending_responses()


@pytest.mark.unit
def test_missing_item_returns_none(client):
    store = DynamoCheckpoints(client=client)
    with Stubber(client) as stub:
        stub.add_response("get_item", {}, get_parameters())

        restored = store.load("execution")

        assert restored is None
        stub.assert_no_pending_responses()


@pytest.mark.unit
def test_table_defaults_to_environment(client, checkpoint, monkeypatch):
    monkeypatch.setenv("SESSIONS_TABLE", "custom-sessions")
    store = DynamoCheckpoints(client=client)
    parameters = put_parameters(ANY)
    parameters["TableName"] = "custom-sessions"

    with Stubber(client) as stub:
        stub.add_response("put_item", {}, parameters)

        saved = store.save(checkpoint)

        assert saved is True
        stub.assert_no_pending_responses()


@pytest.mark.integration
@pytest.mark.skipif(
    not os.environ.get("SEYMOUR_TEST_DYNAMODB_ENDPOINT"),
    reason="SEYMOUR_TEST_DYNAMODB_ENDPOINT is required",
)
def test_real_dynamodb_keeps_only_advancing_steps(checkpoint):
    client = boto3.client(
        "dynamodb",
        endpoint_url=os.environ["SEYMOUR_TEST_DYNAMODB_ENDPOINT"],
        region_name="us-east-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    )
    client.describe_table(TableName="papert-sessions")
    store = DynamoCheckpoints(client=client, table="papert-sessions")
    first = replace(checkpoint, execution_id=f"checkpoint-test-{uuid4()}")
    second = replace(first, step=2, lease="retry-lease", state={"rounds": [1, 2, 3]})

    try:
        assert store.save(first) is True
        assert store.save(first) is False

        assert store.save(second) is True
        assert store.save(first) is False
        assert store.load(first.execution_id) == second

        store.delete(first.execution_id)

        assert store.load(first.execution_id) is None
    finally:
        store.delete(first.execution_id)


@pytest.mark.unit
def test_staged_results_round_trip_beside_the_checkpoint(client):
    result = Result("execution", "lease", 100, "completed", "Olá", 900, evaluation={"ok": True})
    store = DynamoStagedResults(client=client, table="papert-sessions", clock=lambda: 1000)
    key = {"pk": {"S": "CHECKPOINT#execution"}, "sk": {"S": "RESULT"}}
    item = {
        **key,
        "result": {"S": json.dumps(asdict(result), ensure_ascii=False, separators=(",", ":"))},
        "expires": {"N": str(1000 + CHECKPOINT_TTL_SECONDS)},
    }

    with Stubber(client) as stub:
        stub.add_response("put_item", {}, {"TableName": "papert-sessions", "Item": item})
        stub.add_response(
            "get_item",
            {"Item": item},
            {"TableName": "papert-sessions", "Key": key, "ConsistentRead": True},
        )
        stub.add_response("delete_item", {}, {"TableName": "papert-sessions", "Key": key})

        store.stage(result)
        restored = store.staged("execution")
        store.clear("execution")

        stub.assert_no_pending_responses()

    assert restored == result


@pytest.mark.unit
def test_staged_result_errors_cost_the_replay_not_the_run(client):
    result = Result("execution", "lease", 100, "completed", "answer", 900)
    store = DynamoStagedResults(client=client, clock=lambda: 1000)

    with Stubber(client) as stub:
        stub.add_client_error("put_item", service_error_code="InternalServerError")
        stub.add_client_error("get_item", service_error_code="InternalServerError")
        stub.add_client_error("delete_item", service_error_code="InternalServerError")

        store.stage(result)
        loaded = store.staged("execution")
        store.clear("execution")

        stub.assert_no_pending_responses()

    assert loaded is None
