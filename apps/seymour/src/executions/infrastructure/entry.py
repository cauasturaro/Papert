"""Single-execution entry point shared by HTTP and SQS."""

import json
import os
from uuid import UUID

import boto3
from botocore.config import Config

from src.executions.infrastructure.composition import run_job


def correlation_id(message: object) -> str | None:
    """The envelope's execution id for logs, only when it is a well-formed UUID."""
    if not isinstance(message, dict):
        return None

    value = message.get("executionId")

    try:
        return str(UUID(value)) if isinstance(value, str) else None
    except ValueError:
        return None


def run_single_execution(message: dict) -> None:
    options = {
        "region_name": os.environ.get("AWS_REGION", "us-east-1"),
        "endpoint_url": os.environ.get("AWS_ENDPOINT_URL"),
        "config": Config(connect_timeout=3, read_timeout=10, retries={"max_attempts": 2}),
    }
    control_client = boto3.client("lambda", **options)
    queue = boto3.client("sqs", **options)

    def control(payload):
        response = control_client.invoke(
            FunctionName=os.environ["CORE_EXECUTION_CONTROL_FUNCTION"],
            InvocationType="RequestResponse",
            Payload=json.dumps(payload).encode(),
        )
        result = json.load(response["Payload"])
        if response.get("FunctionError"):
            raise RuntimeError("Core execution control failed")

        return result

    def publish(payload):
        queue.send_message(
            QueueUrl=os.environ["RESULTS_QUEUE_URL"],
            MessageBody=json.dumps(payload),
        )

    run_job(message, control, publish)
