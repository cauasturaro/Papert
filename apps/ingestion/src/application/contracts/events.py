"""Inbound S3/SQS ingestion messages and their decoded form."""

import json
from dataclasses import dataclass
from typing import Literal
from urllib.parse import unquote_plus


@dataclass(frozen=True)
class SourceNotification:
    kind: Literal["created", "removed", "ignored"]
    bucket: str
    key: str
    version_id: str | None
    sequencer: str | None
    size: int


@dataclass(frozen=True)
class IngestionEvent:
    receive_count: int
    notifications: tuple[SourceNotification, ...] = ()


@dataclass(frozen=True)
class ReindexEvent:
    receive_count: int
    document_id: str


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
