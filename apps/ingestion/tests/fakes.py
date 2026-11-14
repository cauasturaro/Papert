from contextlib import AbstractContextManager, nullcontext
from dataclasses import dataclass, field
from typing import Any, Literal

from src.domain.chunking import Chunk
from src.domain.control import (
    Begin,
    Complete,
    Completion,
    Document,
    Fail,
    ProcessableDocument,
    Reindex,
    Removal,
    Removed,
)
from src.domain.extraction import Block, Extracted
from src.domain.ports import Embedded


@dataclass
class FakeControl:
    requests: list[Begin | Complete | Fail | Removal | Reindex] = field(default_factory=list)
    document: Document | ProcessableDocument = field(
        default_factory=lambda: ProcessableDocument("document", "workspace", "md")
    )
    completion: Completion = field(default_factory=lambda: Completion(accepted=True))
    reindexed: Document | ProcessableDocument = field(
        default_factory=lambda: Document("reject", reason="unavailable")
    )
    removed: Removed = field(default_factory=lambda: Removed("document", "workspace", deleted=True))
    completion_failures: int = 0

    def begin(self, request: Begin) -> Document | ProcessableDocument:
        self.requests.append(request)

        return self.document

    def complete(self, request: Complete) -> Completion:
        self.requests.append(request)
        if self.completion_failures:
            self.completion_failures -= 1
            raise ConnectionError("Core unavailable after commit")

        return self.completion

    def fail(self, request: Fail) -> Completion:
        self.requests.append(request)

        return Completion(accepted=True)

    def removal(self, request: Removal) -> Removed:
        self.requests.append(request)

        return self.removed

    def reindex(self, request: Reindex) -> Document | ProcessableDocument:
        self.requests.append(request)

        return self.reindexed


@dataclass
class FakeExtractor:
    extracted: Extracted = field(
        default_factory=lambda: Extracted([Block("Extracted HTTP reference.", {"heading": "HTTP"})])
    )

    def extract(self, declared_format: str, data: bytes) -> Extracted:
        return self.extracted


class FakeObjects:
    def read(self, bucket: str, key: str, version_id: str) -> bytes:
        return b"stored source"


@dataclass
class FakeEmbeddings:
    model: str = "fake-embedding"
    inputs: list[list[str]] = field(default_factory=list)

    def embed(self, texts: list[str]) -> Embedded:
        self.inputs.append(texts)

        return Embedded([[0.5] for text in texts], 3, self.model)


@dataclass
class FakeStore:
    outcome: Literal["written", "deleted", "stale", "duplicate"] = "written"
    writes: list[tuple] = field(default_factory=list)
    purges: list[tuple[str, str]] = field(default_factory=list)
    saved: Complete | None = None
    saved_job: str | None = None
    stages: list[str] = field(default_factory=list)

    def work(self, document_id: str) -> AbstractContextManager[None]:
        return nullcontext()

    def completed(
        self,
        document_id: str,
        workspace_id: str,
        version_id: str,
        job_id: str | None,
        model: str,
        replace: bool,
    ) -> Complete | None:
        if replace and self.saved_job != job_id:
            return None

        return self.saved

    def write(
        self,
        document_id: str,
        workspace_id: str,
        version_id: str,
        sequencer: str,
        chunks: list[Chunk],
        embedded: Embedded,
        character_count: int,
        replace: bool = False,
        completion: Complete | None = None,
        job_id: str | None = None,
    ) -> Literal["written", "deleted", "stale", "duplicate"]:
        self.stages.append("index")
        self.writes.append(
            (document_id, workspace_id, version_id, sequencer, character_count, replace)
        )
        if self.outcome == "written":
            self.saved = completion
            self.saved_job = job_id

        return self.outcome

    def clear(self, document_id: str, workspace_id: str, version_id: str, sequencer: str) -> None:
        self.stages.append("clear")

    def purge(self, document_id: str, workspace_id: str) -> None:
        self.purges.append((document_id, workspace_id))


class NoopTracer:
    def document(
        self, document_id: str, version_id: str, metadata: dict
    ) -> AbstractContextManager[Any]:
        return nullcontext()

    def embedding(self, model: str, inputs: int) -> AbstractContextManager[Any]:
        return nullcontext()

    def record_usage(self, observation: Any, model: str, tokens: int) -> None:
        pass


@dataclass
class FakeRenditions:
    stages: list[str]
    writes: list[dict] = field(default_factory=list)
    error: Exception | None = None

    def write(self, bucket: str, key: str, body: dict) -> None:
        self.stages.append("rendition")
        if self.error is not None:
            raise self.error

        self.writes.append(body)
