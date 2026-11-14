"""Process decoded source events for registered documents."""

import json
import time
from dataclasses import dataclass
from enum import Enum

from src.application.contracts.events import IngestionEvent, ReindexEvent, SourceNotification
from src.domain.chunking import Chunk, chunk
from src.domain.control import Begin, Complete, Fail, ProcessableDocument, Reindex, Removal, Version
from src.domain.errors import IngestionFailure
from src.domain.extraction import Extracted
from src.domain.ports import Embedded, Ports
from src.domain.rendition import rendition, rendition_key

MAX_RECEIVES = 3


class Outcome(Enum):
    HANDLED = "handled"


def log(metric: str, **fields: object) -> None:
    print(json.dumps({"metric": metric, **fields}), flush=True)


def _removal(ports: Ports, notification: SourceNotification) -> None:
    answer = ports.control.removal(Removal(notification.bucket, notification.key))

    if not answer.document_id or not answer.deleted:
        log("source_removal_ignored", known=bool(answer.document_id))
        return

    ports.store.purge(answer.document_id, answer.workspace_id)
    log("source_purged", documentId=answer.document_id)


@dataclass(frozen=True)
class PreparedDocument:
    extracted: Extracted
    chunks: list[Chunk]


def prepare_document(
    ports: Ports, notification: SourceNotification, document: ProcessableDocument
) -> PreparedDocument:
    document_id = document.document_id
    assert notification.version_id is not None

    data = ports.objects.read(notification.bucket, notification.key, notification.version_id)

    extracted = ports.extractor.extract(document.format, data)

    hard_key = "page" if document.format == "pdf" else None
    chunks = chunk(extracted, hard_key=hard_key)

    body = rendition(document_id, notification.version_id, document.format, extracted)

    if body is not None:
        key = rendition_key(document_id, notification.version_id)
        ports.renditions.write(notification.bucket, key, body)

    return PreparedDocument(extracted, chunks)


def complete_indexing(
    ports: Ports,
    notification: SourceNotification,
    document: ProcessableDocument,
    prepared: PreparedDocument,
    embedded: Embedded,
    replace: bool,
    job_id: str | None,
    started: float,
) -> None:
    document_id = document.document_id
    workspace_id = document.workspace_id
    extracted = prepared.extracted
    chunks = prepared.chunks
    assert notification.version_id is not None
    assert notification.sequencer is not None

    completion = Complete(
        document_id=document_id,
        version_id=notification.version_id,
        sequencer=notification.sequencer,
        chunk_count=len(prepared.chunks),
        character_count=prepared.extracted.character_count,
        page_count=prepared.extracted.page_count,
        embedding_tokens=embedded.tokens,
        warnings=prepared.extracted.warnings[:10],
    )

    outcome = ports.store.write(
        document_id,
        workspace_id,
        notification.version_id,
        notification.sequencer,
        chunks,
        embedded,
        extracted.character_count,
        replace=replace,
        completion=completion,
        job_id=job_id,
    )

    if outcome == "deleted":
        log("source_skipped", documentId=document_id, reason="deleted")
        return

    if outcome == "stale":
        log("source_skipped", documentId=document_id, reason="stale")
        return

    answer = ports.control.complete(completion)

    # Deleted while processing: never leave vectors behind for a removed document.
    if answer.deleted:
        ports.store.purge(document_id, workspace_id)
        log("source_purged", documentId=document_id, reason="deleted_during_ingestion")
        return

    log(
        "source_ingested",
        documentId=document_id,
        format=document.format,
        accepted=answer.accepted,
        duplicate=outcome == "duplicate",
        chunks=len(chunks),
        characters=extracted.character_count,
        pages=extracted.page_count,
        embeddingTokens=embedded.tokens,
        durationMs=round((time.monotonic() - started) * 1000),
    )


def _index(
    ports: Ports,
    notification: SourceNotification,
    document: ProcessableDocument,
    replace: bool,
    job_id: str | None,
) -> None:
    document_id = document.document_id
    workspace_id = document.workspace_id
    started = time.monotonic()

    persisted = ports.store.completed(
        document_id,
        workspace_id,
        notification.version_id,
        job_id,
        ports.embeddings.model,
        replace,
    )
    if persisted is not None:
        answer = ports.control.complete(persisted)
        if answer.deleted:
            ports.store.purge(document_id, workspace_id)
        return

    prepared = prepare_document(ports, notification, document)
    chunks = prepared.chunks

    trace_metadata = {"format": document.format, "chunks": len(chunks)}

    with (
        ports.trace.document(document_id, notification.version_id, trace_metadata),
        ports.trace.embedding(ports.embeddings.model, len(chunks)) as observation,
    ):
        embedded = ports.embeddings.embed([piece.content for piece in chunks])
        ports.trace.record_usage(observation, embedded.model, embedded.tokens)

    complete_indexing(ports, notification, document, prepared, embedded, replace, job_id, started)


def _created(ports: Ports, notification: SourceNotification, receive_count: int) -> None:
    if not notification.version_id or not notification.sequencer:
        log("source_rejected", reason="unversioned_event")
        return

    begin = ports.control.begin(
        Begin(
            notification.bucket,
            notification.key,
            notification.version_id,
            notification.sequencer,
            notification.size,
        )
    )

    if begin.outcome == "deleted":
        ports.store.purge(begin.document_id, begin.workspace_id)
        log("source_skipped", documentId=begin.document_id, reason="deleted")
        return

    # A rejected newer version supersedes the old one, so its chunks must go too.
    if begin.outcome == "invalid":
        ports.store.clear(
            begin.document_id,
            begin.workspace_id,
            notification.version_id,
            notification.sequencer,
        )
        log("source_rejected", documentId=begin.document_id, reason=begin.reason)
        return

    if not isinstance(begin, ProcessableDocument):
        log("source_rejected", outcome=begin.outcome, reason=begin.reason)
        return

    with ports.store.work(begin.document_id):
        _process(ports, notification, begin, receive_count, replace=False)


def _reindex(ports: Ports, document_id: str, receive_count: int, job_id: str) -> None:
    answer = ports.control.reindex(Reindex(document_id))

    if not isinstance(answer, ProcessableDocument):
        if answer.reason == "processing":
            raise RuntimeError("Source reindex claim is not available yet")

        log("source_reindex_skipped", documentId=document_id, reason=answer.reason)
        return

    if not all((answer.bucket, answer.key, answer.version_id, answer.sequencer)):
        raise ValueError("Reindex document is missing its object version")

    notification = SourceNotification(
        kind="created",
        bucket=answer.bucket,
        key=answer.key,
        version_id=answer.version_id,
        sequencer=answer.sequencer,
        size=0,
    )

    _process(ports, notification, answer, receive_count, replace=True, job_id=job_id)


def _process(
    ports: Ports,
    notification: SourceNotification,
    document: ProcessableDocument,
    receive_count: int,
    replace: bool,
    job_id: str | None = None,
) -> None:
    assert notification.version_id is not None
    assert notification.sequencer is not None
    version = Version(document.document_id, notification.version_id, notification.sequencer)

    try:
        _index(ports, notification, document, replace, job_id)
    except IngestionFailure as failure:
        ports.store.clear(
            document.document_id,
            document.workspace_id,
            version.version_id,
            version.sequencer,
        )

        ports.control.fail(
            Fail(version.document_id, version.version_id, version.sequencer, failure.code)
        )

        log("source_failed", documentId=document.document_id, code=failure.code)
    except Exception as error:
        log(
            "source_attempt_failed",
            documentId=document.document_id,
            error=type(error).__name__,
            receive=receive_count,
        )

        # On the last delivery, leave an explicit state before SQS moves the message to the DLQ.
        if receive_count >= MAX_RECEIVES:
            try:
                ports.control.fail(
                    Fail(
                        version.document_id,
                        version.version_id,
                        version.sequencer,
                        "processing_failed",
                    )
                )
            except Exception:
                log("source_failure_report_failed", documentId=document.document_id)

        raise


def process_record(ports: Ports, event: IngestionEvent | ReindexEvent) -> Outcome:
    if isinstance(event, ReindexEvent):
        with ports.store.work(event.document_id):
            _reindex(ports, event.document_id, event.receive_count, event.job_id)
        return Outcome.HANDLED

    for notification in event.notifications:
        if notification.kind == "removed":
            _removal(ports, notification)
        elif notification.kind == "created":
            _created(ports, notification, event.receive_count)

    return Outcome.HANDLED
