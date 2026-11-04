"""Application ingestion scenarios without transport, RPC or parser adapters."""

from contextlib import nullcontext
from dataclasses import dataclass, field
from unittest.mock import Mock

from src.application.control import (
    Begin,
    Complete,
    Completion,
    Document,
    Fail,
    Reindex,
    Removal,
    Removed,
)
from src.application.events import IngestionEvent, Outcome, SourceNotification
from src.application.pipeline import process_record
from src.application.ports import Embedded, Ports
from src.domain.extraction import Block, Extracted


@dataclass
class FakeControl:
    requests: list[Begin | Complete | Fail | Removal | Reindex] = field(default_factory=list)

    def begin(self, request: Begin) -> Document:
        self.requests.append(request)

        return Document("process", "document", "workspace", "md")

    def complete(self, request: Complete) -> Completion:
        self.requests.append(request)

        return Completion(accepted=True)

    def fail(self, request: Fail) -> Completion:
        self.requests.append(request)

        return Completion(accepted=True)

    def removal(self, request: Removal) -> Removed:
        self.requests.append(request)

        return Removed("document", "workspace", deleted=True)

    def reindex(self, request: Reindex) -> Document:
        self.requests.append(request)

        return Document("reject", reason="unavailable")


class FakeExtractor:
    def extract(self, declared_format: str, data: bytes) -> Extracted:
        assert (declared_format, data) == ("md", b"stored source")

        return Extracted([Block("Extracted HTTP reference.", {"heading": "HTTP"})])


class FakeObjects:
    def read(self, bucket: str, key: str, version_id: str) -> bytes:
        assert (bucket, key, version_id) == ("sources", "source.md", "version")

        return b"stored source"


class FakeEmbeddings:
    model = "fake-embedding"

    def embed(self, texts: list[str]) -> Embedded:
        assert texts == ["Extracted HTTP reference."]

        return Embedded([[0.5]], 3, self.model)


class FakeStore:
    def __init__(self):
        self.writes = []
        self.purges = []

    def write(
        self, document, workspace, version, sequencer, chunks, embedded, characters, replace=False
    ):
        self.writes.append((document, workspace, version, sequencer, characters, replace))

        return "written"

    def clear(self, document, workspace, version, sequencer):
        raise AssertionError("The successful source must not be cleared")

    def purge(self, document, workspace):
        self.purges.append((document, workspace))


class NoopTracer:
    def document(self, document_id, version_id, metadata):
        return nullcontext()

    def embedding(self, model, inputs):
        return nullcontext()

    def record_usage(self, observation, model, tokens):
        pass


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
