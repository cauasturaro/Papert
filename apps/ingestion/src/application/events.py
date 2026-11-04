"""Decoded inbound ingestion events, independent of S3/SQS envelopes."""

from dataclasses import dataclass
from enum import Enum
from typing import Literal


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


class Outcome(Enum):
    HANDLED = "handled"
