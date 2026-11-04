"""S3/SQS inbound decoding and Lambda partial-batch response encoding."""

import json
from urllib.parse import unquote_plus

from src.application.events import IngestionEvent, ReindexEvent, SourceNotification
from src.application.pipeline import process_record as process_event
from src.application.ports import Ports


def _notifications(payload):
    # S3 sends a test event when the notification configuration is created.
    if payload.get("Event") == "s3:TestEvent":
        return []

    notifications = []

    for record in payload.get("Records", []):
        s3 = record["s3"]
        event_name = record["eventName"]
        kind = "ignored"

        if event_name.startswith("ObjectCreated"):
            kind = "created"
        elif event_name.startswith("ObjectRemoved"):
            kind = "removed"

        notifications.append(
            SourceNotification(
                kind=kind,
                bucket=s3["bucket"]["name"],
                key=unquote_plus(s3["object"]["key"]),
                version_id=s3["object"].get("versionId"),
                sequencer=s3["object"].get("sequencer"),
                size=s3["object"].get("size", 0),
            )
        )

    return notifications


def decode_record(record: dict) -> IngestionEvent | ReindexEvent:
    receive_count = int(record.get("attributes", {}).get("ApproximateReceiveCount", "1"))
    payload = json.loads(record["body"])

    # Operator messages request reindexing; Core decides whether the source applies.
    if "PapertReindex" in payload:
        return ReindexEvent(receive_count, payload["PapertReindex"]["documentId"])

    return IngestionEvent(receive_count, tuple(_notifications(payload)))


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
