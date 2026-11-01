#!/usr/bin/env python3
"""
smoke-queue.py
Smoke test for the papert-ingestion SQS queue and its DLQ.

Demonstrates:
  - Message send
  - Receive with short VisibilityTimeout (simulated consumer failure, no delete)
  - Repeated failed receives up to maxReceiveCount (3)
  - Message redrive to papert-ingestion-dlq
  - DLQ cleanup

Run via: make smoke-queue
Requires: boto3 (available in any Python 3 env that has it; or run inside the
          papert-local network where Floci is reachable on port 4566).
"""

import sys
import time

import boto3
from botocore.config import Config

ENDPOINT = "http://localhost:4566"
REGION = "us-east-1"
QUEUE_NAME = "papert-ingestion"
DLQ_NAME = "papert-ingestion-dlq"
# Must match maxReceiveCount in ingestion.yaml
MAX_RECEIVE_COUNT = 3
# Seconds; short enough for a smoke test, long enough for SQS to track ApproximateReceiveCount
VISIBILITY_TIMEOUT = 3

client = boto3.client(
    "sqs",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id="test",
    aws_secret_access_key="test",
    config=Config(retries={"total_max_attempts": 1}),
)


def step(label: str, ok: bool, detail: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not ok:
        sys.exit(1)


def get_queue_url(name: str) -> str:
    return client.get_queue_url(QueueName=name)["QueueUrl"]


def queue_depth(url: str) -> int:
    attrs = client.get_queue_attributes(
        QueueUrl=url,
        AttributeNames=["ApproximateNumberOfMessages"],
    )["Attributes"]
    return int(attrs["ApproximateNumberOfMessages"])


def main() -> None:
    print(f"\nSmoke test: {QUEUE_NAME} → {DLQ_NAME}\n")

    # ── 1. Resolve queue URLs ──────────────────────────────────────────────────
    try:
        queue_url = get_queue_url(QUEUE_NAME)
        dlq_url = get_queue_url(DLQ_NAME)
    except Exception as exc:
        step("Resolve queue URLs", False, str(exc))
        return
    step("Resolve queue URLs", True, f"{QUEUE_NAME} and {DLQ_NAME} reachable")

    # ── 2. Send a test message ─────────────────────────────────────────────────
    body = '{"source": "smoke-test", "document_id": "test-001"}'
    send_resp = client.send_message(QueueUrl=queue_url, MessageBody=body)
    msg_id = send_resp.get("MessageId", "")
    step("Send test message", bool(msg_id), f"MessageId={msg_id}")

    # ── 3. Simulate MAX_RECEIVE_COUNT consumer failures ────────────────────────
    # Each receive increments ApproximateReceiveCount; not deleting the message
    # causes it to become inflight and then visible again after VisibilityTimeout.
    for attempt in range(1, MAX_RECEIVE_COUNT + 1):
        time.sleep(VISIBILITY_TIMEOUT + 1)  # wait for visibility to expire
        msgs = client.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=1,
            VisibilityTimeout=VISIBILITY_TIMEOUT,
            AttributeNames=["ApproximateReceiveCount"],
        ).get("Messages", [])
        received = len(msgs) == 1
        receive_count = msgs[0]["Attributes"].get("ApproximateReceiveCount", "?") if msgs else "—"
        step(
            f"Receive attempt {attempt}/{MAX_RECEIVE_COUNT} (no delete)",
            received,
            f"ApproximateReceiveCount={receive_count}",
        )
        # Intentionally do NOT call delete_message — simulates a failing consumer.

    # ── 4. Wait for redrive ────────────────────────────────────────────────────
    # After the final visibility timeout, SQS should move the message to DLQ.
    time.sleep(VISIBILITY_TIMEOUT + 2)

    # Main queue should now be empty
    main_depth = queue_depth(queue_url)
    step("Main queue empty after redrive", main_depth == 0, f"depth={main_depth}")

    # ── 5. Verify message arrived in DLQ ──────────────────────────────────────
    dlq_msgs = client.receive_message(
        QueueUrl=dlq_url,
        MaxNumberOfMessages=1,
        VisibilityTimeout=30,
    ).get("Messages", [])
    arrived = len(dlq_msgs) == 1
    step("Message arrived in DLQ", arrived)

    # ── 6. Clean up DLQ ───────────────────────────────────────────────────────
    if dlq_msgs:
        client.delete_message(
            QueueUrl=dlq_url,
            ReceiptHandle=dlq_msgs[0]["ReceiptHandle"],
        )
    step("DLQ message deleted (cleanup)", True)

    print("\nsmoke-queue: all steps passed.\n")


if __name__ == "__main__":
    main()
