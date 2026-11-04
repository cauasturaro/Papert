"""Lambda SQS batch processing and partial-batch response encoding."""

from src.application.contracts.events import decode_record
from src.application.pipeline import process_record as process_event
from src.domain.ports import Ports


def process_record(ports: Ports, record: dict):
    event = decode_record(record)

    return process_event(ports, event)


def process_batch(ports: Ports, event: dict) -> dict:
    failures = []

    for record in event.get("Records", []):
        try:
            process_record(ports, record)
        except Exception:
            failures.append({"itemIdentifier": record["messageId"]})

    return {"batchItemFailures": failures}
