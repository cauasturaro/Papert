"""Application-owned contracts for ingestion adapters."""

from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Any, Literal, Protocol

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
from src.domain.chunking import Chunk
from src.domain.extraction import Extracted


@dataclass(frozen=True)
class Embedded:
    vectors: list[list[float]]
    tokens: int
    model: str


class Control(Protocol):
    def begin(self, request: Begin) -> Document: ...
    def complete(self, request: Complete) -> Completion: ...
    def fail(self, request: Fail) -> Completion: ...
    def removal(self, request: Removal) -> Removed: ...
    def reindex(self, request: Reindex) -> Document: ...


class Extractor(Protocol):
    def extract(self, declared_format: str, data: bytes) -> Extracted: ...


class ObjectReader(Protocol):
    def read(self, bucket: str, key: str, version_id: str) -> bytes: ...


class RenditionWriter(Protocol):
    def write(self, bucket: str, key: str, body: dict) -> None: ...


class SourceIndex(Protocol):
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
    ) -> Literal["written", "deleted", "stale", "duplicate"]: ...

    def clear(
        self, document_id: str, workspace_id: str, version_id: str, sequencer: str
    ) -> None: ...

    def purge(self, document_id: str, workspace_id: str) -> None: ...


class Embedder(Protocol):
    model: str

    def embed(self, texts: list[str]) -> Embedded: ...


class IngestionTracer(Protocol):
    def document(
        self, document_id: str, version_id: str, metadata: dict
    ) -> AbstractContextManager[Any]: ...

    def embedding(self, model: str, inputs: int) -> AbstractContextManager[Any]: ...

    def record_usage(self, observation: Any, model: str, tokens: int) -> None: ...


@dataclass
class Ports:
    control: Control
    objects: ObjectReader
    store: SourceIndex
    embeddings: Embedder
    trace: IngestionTracer
    extractor: Extractor
    renditions: RenditionWriter
