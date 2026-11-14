"""Application ingestion scenarios without transport, RPC or parser adapters."""

from unittest.mock import Mock

import pytest

from src.application.contracts.events import IngestionEvent, ReindexEvent, SourceNotification
from src.application.pipeline import Outcome, process_record
from src.domain.control import (
    Begin,
    Complete,
    Completion,
    Document,
    ProcessableDocument,
    Reindex,
    Removal,
    Removed,
)
from src.domain.extraction import Block, Extracted
from src.domain.ports import Ports
from tests.fakes import (
    FakeControl,
    FakeEmbeddings,
    FakeExtractor,
    FakeObjects,
    FakeRenditions,
    FakeStore,
    NoopTracer,
)

pytestmark = pytest.mark.unit


def test_semantic_created_removed_and_ignored_events_drive_typed_ports(capsys):
    control = FakeControl()
    store = FakeStore()
    renditions = Mock()
    ports = Ports(
        control, FakeObjects(), store, FakeEmbeddings(), NoopTracer(), FakeExtractor(), renditions
    )
    created = SourceNotification("created", "sources", "source.md", "version", "00A1", 13)
    removed = SourceNotification("removed", "sources", "source.md", "version", "00A2", 0)
    ignored = SourceNotification("ignored", "sources", "source.md", None, None, 0)

    outcome = process_record(ports, IngestionEvent(1, (created, removed, ignored)))

    assert outcome is Outcome.HANDLED
    assert control.requests == [
        Begin("sources", "source.md", "version", "00A1", 13),
        Complete("document", "version", "00A1", 1, 25, None, 3, []),
        Removal("sources", "source.md"),
    ]
    assert store.writes == [("document", "workspace", "version", "00A1", 25, False)]
    assert store.purges == [("document", "workspace")]
    renditions.write.assert_not_called()
    output = capsys.readouterr().out
    assert '"metric": "source_ingested"' in output
    assert '"metric": "source_purged"' in output


def adapters(control=None, store=None, format="md"):
    control = control or FakeControl(document=ProcessableDocument("document", "workspace", format))
    store = store or FakeStore()
    renditions = FakeRenditions(store.stages)

    return Ports(
        control, FakeObjects(), store, FakeEmbeddings(), NoopTracer(), FakeExtractor(), renditions
    )


def source_event(reindex=False):
    if reindex:
        return ReindexEvent(1, "document", "job")

    notification = SourceNotification("created", "sources", "source.md", "version", "00A1", 13)

    return IngestionEvent(1, (notification,))


def processable(format):
    return ProcessableDocument(
        "document", "workspace", format, "sources", "source.md", "version", "00A1"
    )


@pytest.mark.parametrize("outcome", ["stale", "deleted"])
def test_stale_or_tombstoned_writes_are_not_completed(outcome):
    ports = adapters(store=FakeStore(outcome=outcome))

    process_record(ports, source_event())

    assert not any(isinstance(request, Complete) for request in ports.control.requests)


def test_deletion_during_ingestion_purges_the_written_chunks():
    control = FakeControl(completion=Completion(deleted=True))
    ports = adapters(control)

    process_record(ports, source_event())

    assert ports.store.writes
    assert ports.store.purges == [("document", "workspace")]


@pytest.mark.parametrize("format", ["doc", "docx", "pdf", "md"])
@pytest.mark.parametrize("reindex", [False, True])
def test_renditions_preserve_extracted_blocks_before_index_write(format, reindex):
    document = processable(format)
    control = FakeControl(document=document, reindexed=document)
    ports = adapters(control)
    extracted = Extracted(
        [
            Block("Ação e coração", {"paragraphStart": 1, "paragraphEnd": 1, "heading": "Ação"}),
            Block("  Second paragraph.\n", {"paragraphStart": 3, "paragraphEnd": 4}),
        ]
    )
    ports.extractor = FakeExtractor(extracted)

    process_record(ports, source_event(reindex))

    assert ports.store.stages == (
        ["rendition", "index"] if format in {"doc", "docx"} else ["index"]
    )
    assert isinstance(control.requests[-1], Complete)
    if format in {"doc", "docx"}:
        assert ports.renditions.writes[0]["blocks"] == [
            {
                "text": "Ação e coração",
                "location": {"paragraphStart": 1, "paragraphEnd": 1, "heading": "Ação"},
            },
            {"text": "  Second paragraph.\n", "location": {"paragraphStart": 3, "paragraphEnd": 4}},
        ]


@pytest.mark.parametrize("format", ["doc", "docx"])
@pytest.mark.parametrize("reindex", [False, True])
def test_rendition_write_failure_propagates_without_index_or_completion(format, reindex):
    document = processable(format)
    control = FakeControl(document=document, reindexed=document)
    ports = adapters(control)
    ports.renditions.error = ConnectionError("S3 unavailable")

    with pytest.raises(ConnectionError, match="S3 unavailable"):
        process_record(ports, source_event(reindex))

    assert ports.store.writes == []
    assert ports.embeddings.inputs == []
    assert not any(isinstance(request, Complete) for request in control.requests)


@pytest.mark.parametrize("reindex", [False, True])
def test_completion_failure_resumes_persisted_result_without_embedding_again(reindex):
    document = processable("md")
    control = FakeControl(document=document, reindexed=document, completion_failures=1)
    ports = adapters(control)
    event = source_event(reindex)

    with pytest.raises(ConnectionError, match="after commit"):
        process_record(ports, event)

    first_inputs = ports.embeddings.inputs.copy()

    process_record(ports, event)

    assert ports.embeddings.inputs == first_inputs
    assert len(ports.store.writes) == 1
    assert ports.store.saved_job == ("job" if reindex else None)
    assert sum(isinstance(request, Complete) for request in control.requests) == 2


def test_deleted_documents_and_removal_events_purge():
    deleted = Document("deleted", "document", "workspace", reason="deleted")
    created = adapters(FakeControl(document=deleted))
    removed = adapters()
    notification = SourceNotification("removed", "sources", "source.md", "version", "00A2", 0)

    process_record(created, source_event())
    process_record(removed, IngestionEvent(1, (notification,)))

    assert created.store.purges == [("document", "workspace")]
    assert removed.store.purges == [("document", "workspace")]
    assert created.store.writes == removed.store.writes == []


@pytest.mark.parametrize("removed", [Removed(), Removed("document", "workspace", deleted=False)])
def test_removal_of_live_or_unknown_objects_is_ignored(removed):
    ports = adapters(FakeControl(removed=removed))
    notification = SourceNotification("removed", "sources", "source.md", "version", "00A2", 0)

    process_record(ports, IngestionEvent(1, (notification,)))

    assert ports.store.purges == []


def test_invalid_newer_versions_clear_previous_chunks():
    invalid = Document("invalid", "document", "workspace", reason="invalid_upload")
    ports = adapters(FakeControl(document=invalid))

    process_record(ports, source_event())

    assert ports.store.stages == ["clear"]
    assert ports.store.writes == []
    assert ports.embeddings.inputs == []


def test_reindex_rewrites_the_current_version_and_completes_it():
    control = FakeControl(reindexed=processable("md"))
    ports = adapters(control)

    process_record(ports, source_event(reindex=True))

    assert isinstance(control.requests[0], Reindex)
    assert isinstance(control.requests[1], Complete)
    assert control.requests[1].sequencer == "00A1"
    assert ports.store.writes == [("document", "workspace", "version", "00A1", 25, True)]


def test_reindex_skipped_by_core_does_nothing():
    control = FakeControl(reindexed=Document("skip", reason="deleted"))
    ports = adapters(control)

    process_record(ports, source_event(reindex=True))

    assert control.requests == [Reindex("document")]
    assert ports.store.writes == []
    assert ports.embeddings.inputs == []
