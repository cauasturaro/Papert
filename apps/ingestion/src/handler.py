"""AWS Lambda entry point for the papert-ingestion SQS trigger."""

import json
import os

import boto3

from src.application.pipeline import process_batch
from src.infrastructure.composition import build_ports
from src.infrastructure.store import connect

_lambda = None


def control(payload):
    global _lambda

    # Created lazily and reused across warm invocations.
    _lambda = _lambda or boto3.client("lambda", region_name=os.environ.get("AWS_REGION"))

    # IAM restricts this invocation to the ingestion role; Core has no HTTP route for it.
    response = _lambda.invoke(
        FunctionName=os.environ["SOURCE_CONTROL_FUNCTION"],
        Payload=json.dumps(payload).encode(),
    )

    if response.get("FunctionError"):
        raise RuntimeError("Source control rejected the request")

    return json.loads(response["Payload"].read())


def handler(event, _context):
    with connect() as connection:
        ports = build_ports(control, connection)

        return process_batch(ports, event)
