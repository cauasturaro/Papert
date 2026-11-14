"""SQS decoding and partial-batch responses for leased executions."""

import json
import logging

from src.executions.infrastructure.entry import correlation_id, run_single_execution

log = logging.getLogger(__name__)


def handler(event, _context):
    failures = []

    for record in event["Records"]:
        correlation = {
            "operation": "chat_queue",
            "messageId": record["messageId"],
            "receiveCount": _receive_count(record),
        }

        try:
            message = json.loads(record["body"])
            correlation["executionId"] = correlation_id(message)

            run_single_execution(message)
        except Exception:
            log.exception("execution_failed", extra=correlation)

            # SQS re-delivers only failed items; the queue owns retry/DLQ policy.
            failures.append({"itemIdentifier": record["messageId"]})

    return {"batchItemFailures": failures}


def _receive_count(record: dict) -> int | None:
    value = record.get("attributes", {}).get("ApproximateReceiveCount")

    return int(value) if isinstance(value, str) and value.isdigit() else None
