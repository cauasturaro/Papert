"""Process one SQS record carrying S3 notifications for registered source documents."""

import json
import time
from dataclasses import dataclass
from urllib.parse import unquote_plus

from src.application.ports import Ports
from src.domain.chunking import chunk
from src.domain.errors import IngestionFailure
from src.domain.extraction import extract

MAX_RECEIVES = 3


@dataclass(frozen=True)
class S3Notification:
    event: str
    bucket: str
    key: str
    version_id: str | None
    sequencer: str | None
    size: int


def log(metric, **fields):
    print(json.dumps({"metric": metric, **fields}), flush=True)


def _notifications(payload):
    # S3 sends a test event when the notification configuration is created.
    if payload.get("Event") == "s3:TestEvent":
        return []

    notifications = []

    for record in payload.get("Records", []):
        s3 = record["s3"]

        notifications.append(
            S3Notification(
                event=record["eventName"],
                bucket=s3["bucket"]["name"],
                key=unquote_plus(s3["object"]["key"]),
                version_id=s3["object"].get("versionId"),
                sequencer=s3["object"].get("sequencer"),
                size=s3["object"].get("size", 0),
            )
        )

    return notifications


def _removal(ports: Ports, notification: S3Notification):
    answer = ports.control(
        {"action": "removal", "bucket": notification.bucket, "key": notification.key}
    )

    if not answer.get("documentId") or not answer.get("deleted"):
        log("source_removal_ignored", known=bool(answer.get("documentId")))
        return

    ports.store.purge(answer["documentId"], answer["workspaceId"])
    log("source_purged", documentId=answer["documentId"])


def _index(ports: Ports, notification: S3Notification, document, replace):
    document_id = document["documentId"]
    workspace_id = document["workspaceId"]
    started = time.monotonic()

    data = ports.objects.read(notification.bucket, notification.key, notification.version_id)

    extracted = extract(document["format"], data)

    hard_key = "page" if document["format"] == "pdf" else None
    chunks = chunk(extracted, hard_key=hard_key)

    trace_metadata = {"format": document["format"], "chunks": len(chunks)}

    with (
        ports.trace.document(document_id, notification.version_id, trace_metadata),
        ports.trace.embedding(ports.embeddings.model, len(chunks)) as observation,
    ):
        embedded = ports.embeddings.embed([piece.content for piece in chunks])
        ports.trace.record_usage(observation, embedded.model, embedded.tokens)

    outcome = ports.store.write(
        document_id,
        workspace_id,
        notification.version_id,
        notification.sequencer,
        chunks,
        embedded,
        extracted.character_count,
        replace=replace,
    )

    if outcome == "deleted":
        log("source_skipped", documentId=document_id, reason="deleted")
        return

    if outcome == "stale":
        log("source_skipped", documentId=document_id, reason="stale")
        return

    answer = ports.control(
        {
            "action": "complete",
            "documentId": document_id,
            "versionId": notification.version_id,
            "sequencer": notification.sequencer,
            "chunkCount": len(chunks),
            # Extracted text, not chunk lengths: chunks overlap.
            "characterCount": extracted.character_count,
            "pageCount": extracted.page_count,
            "embeddingTokens": embedded.tokens,
            "warnings": extracted.warnings[:10],
        }
    )

    # Deleted while processing: never leave vectors behind for a removed document.
    if answer.get("deleted"):
        ports.store.purge(document_id, workspace_id)
        log("source_purged", documentId=document_id, reason="deleted_during_ingestion")
        return

    log(
        "source_ingested",
        documentId=document_id,
        format=document["format"],
        accepted=answer.get("accepted", False),
        duplicate=outcome == "duplicate",
        chunks=len(chunks),
        characters=extracted.character_count,
        pages=extracted.page_count,
        embeddingTokens=embedded.tokens,
        durationMs=round((time.monotonic() - started) * 1000),
    )


def _created(ports: Ports, notification: S3Notification, receive_count):
    if not notification.version_id or not notification.sequencer:
        log("source_rejected", reason="unversioned_event")
        return

    begin = ports.control(
        {
            "action": "begin",
            "bucket": notification.bucket,
            "key": notification.key,
            "versionId": notification.version_id,
            "sequencer": notification.sequencer,
            "size": notification.size,
        }
    )

    if begin["outcome"] == "deleted":
        ports.store.purge(begin["documentId"], begin["workspaceId"])
        log("source_skipped", documentId=begin["documentId"], reason="deleted")
        return

    # A rejected newer version supersedes the old one, so its chunks must go too.
    if begin["outcome"] == "invalid":
        ports.store.clear(
            begin["documentId"],
            begin["workspaceId"],
            notification.version_id,
            notification.sequencer,
        )
        log("source_rejected", documentId=begin["documentId"], reason=begin["reason"])
        return

    if begin["outcome"] != "process":
        log("source_rejected", outcome=begin["outcome"], reason=begin.get("reason"))
        return

    _process(ports, notification, begin, receive_count, replace=False)


def _reindex(ports: Ports, document_id, receive_count):
    answer = ports.control({"action": "reindex", "documentId": document_id})

    if answer["outcome"] != "process":
        log("source_reindex_skipped", documentId=document_id, reason=answer.get("reason"))
        return

    notification = S3Notification(
        event="",
        bucket=answer["bucket"],
        key=answer["key"],
        version_id=answer["versionId"],
        sequencer=answer["sequencer"],
        size=0,
    )

    _process(ports, notification, answer, receive_count, replace=True)


def _process(ports: Ports, notification: S3Notification, document, receive_count, replace):
    version = {
        "documentId": document["documentId"],
        "versionId": notification.version_id,
        "sequencer": notification.sequencer,
    }

    try:
        _index(ports, notification, document, replace)
    except IngestionFailure as failure:
        ports.store.clear(
            document["documentId"],
            document["workspaceId"],
            version["versionId"],
            version["sequencer"],
        )

        ports.control({"action": "fail", **version, "code": failure.code})

        log("source_failed", documentId=document["documentId"], code=failure.code)
    except Exception as error:
        log(
            "source_attempt_failed",
            documentId=document["documentId"],
            error=type(error).__name__,
            receive=receive_count,
        )

        # On the last delivery, leave an explicit state before SQS moves the message to the DLQ.
        if receive_count >= MAX_RECEIVES:
            try:
                ports.control({"action": "fail", **version, "code": "processing_failed"})
            except Exception:
                log("source_failure_report_failed", documentId=document["documentId"])

        raise


def process_record(ports: Ports, record):
    receive_count = int(record.get("attributes", {}).get("ApproximateReceiveCount", "1"))
    payload = json.loads(record["body"])

    # Operator messages from `make ingestion-reindex`; Core decides whether they apply.
    if "PapertReindex" in payload:
        _reindex(ports, payload["PapertReindex"]["documentId"], receive_count)
        return

    for notification in _notifications(payload):
        if notification.event.startswith("ObjectRemoved"):
            _removal(ports, notification)
        elif notification.event.startswith("ObjectCreated"):
            _created(ports, notification, receive_count)


def process_batch(ports: Ports, event):
    failures = []

    for record in event.get("Records", []):
        try:
            process_record(ports, record)
        except Exception:
            failures.append({"itemIdentifier": record["messageId"]})

    return {"batchItemFailures": failures}
