#!/usr/bin/env python3
"""Exercise redrive on disposable local queues, without touching application work."""

import json
import time
from uuid import uuid4

import boto3
from botocore.config import Config


def main() -> None:
    client = boto3.client(
        "sqs",
        endpoint_url="http://localhost:4566",
        region_name="us-east-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
        config=Config(retries={"total_max_attempts": 1}),
    )
    suffix = uuid4().hex
    queues = []
    try:
        dlq = client.create_queue(QueueName=f"papert-smoke-dlq-{suffix}")["QueueUrl"]
        queues.append(dlq)
        arn = client.get_queue_attributes(QueueUrl=dlq, AttributeNames=["QueueArn"])[
            "Attributes"
        ]["QueueArn"]
        queue = client.create_queue(
            QueueName=f"papert-smoke-{suffix}",
            Attributes={
                "VisibilityTimeout": "1",
                "RedrivePolicy": json.dumps(
                    {"deadLetterTargetArn": arn, "maxReceiveCount": 3}
                ),
            },
        )["QueueUrl"]
        queues.append(queue)
        body = json.dumps({"smoke": suffix})
        message_id = client.send_message(QueueUrl=queue, MessageBody=body)["MessageId"]

        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            client.receive_message(QueueUrl=queue, WaitTimeSeconds=1)
            messages = client.receive_message(QueueUrl=dlq, WaitTimeSeconds=1).get(
                "Messages", []
            )
            if messages:
                assert messages[0]["MessageId"] == message_id
                assert messages[0]["Body"] == body
                print("smoke-queue: message redriven to disposable DLQ.")
                return

        raise TimeoutError("Message did not reach the disposable DLQ within 45 seconds")
    finally:
        for url in reversed(queues):
            client.delete_queue(QueueUrl=url)


if __name__ == "__main__":
    main()
