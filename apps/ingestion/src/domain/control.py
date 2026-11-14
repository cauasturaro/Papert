"""Source lifecycle requests and answers exchanged with Core."""

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class Begin:
    bucket: str
    key: str
    version_id: str
    sequencer: str
    size: int


@dataclass(frozen=True)
class Version:
    document_id: str
    version_id: str
    sequencer: str


@dataclass(frozen=True)
class Complete(Version):
    chunk_count: int
    character_count: int
    page_count: int | None
    embedding_tokens: int
    warnings: list[str]


@dataclass(frozen=True)
class Fail(Version):
    code: str


@dataclass(frozen=True)
class Removal:
    bucket: str
    key: str


@dataclass(frozen=True)
class Reindex:
    document_id: str


@dataclass(frozen=True)
class Document:
    outcome: Literal["reject", "deleted", "invalid", "skip"]
    document_id: str | None = None
    workspace_id: str | None = None
    format: str | None = None
    reason: str | None = None
    bucket: str | None = None
    key: str | None = None
    version_id: str | None = None
    sequencer: str | None = None


@dataclass(frozen=True)
class ProcessableDocument:
    document_id: str
    workspace_id: str
    format: str
    bucket: str | None = None
    key: str | None = None
    version_id: str | None = None
    sequencer: str | None = None
    outcome: Literal["process"] = field(default="process", init=False)
    reason: None = None


@dataclass(frozen=True)
class Completion:
    accepted: bool = False
    deleted: bool = False


@dataclass(frozen=True)
class Removed:
    document_id: str | None = None
    workspace_id: str | None = None
    deleted: bool = False
