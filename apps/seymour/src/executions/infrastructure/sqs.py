"""SQS decoding and partial-batch responses for leased executions."""

import json

from src.executions.infrastructure.entry import run_single_execution


def handler(event, _context):
    failures = []

    for record in event["Records"]:
        try:
            run_single_execution(json.loads(record["body"]))
        except Exception:
            # SQS re-delivers only failed items; the queue owns retry/DLQ policy.
            failures.append({"itemIdentifier": record["messageId"]})

    return {"batchItemFailures": failures}
