"""Pure ordering and indexing rules for S3 object versions."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class ObjectVersion:
    version_id: str
    sequencer: str


@dataclass(frozen=True)
class StoredVersion:
    version_id: str | None
    sequencer: str | None
    deleted: bool
    indexed: bool


def compare_sequencers(left: str, right: str) -> int:
    """S3 sequencers are hexadecimal; compare after left-padding to equal length."""
    width = max(len(left), len(right))
    a = left.upper().zfill(width)
    b = right.upper().zfill(width)

    if a == b:
        return 0

    return -1 if a < b else 1


def write_decision(
    stored: StoredVersion | None,
    incoming: ObjectVersion,
    replace: bool,
) -> Literal["write", "deleted", "stale", "duplicate"]:
    if stored is None:
        return "write"

    if stored.deleted:
        return "deleted"

    if stored.sequencer:
        order = compare_sequencers(incoming.sequencer, stored.sequencer)

        if order < 0 or (order == 0 and stored.version_id != incoming.version_id):
            return "stale"

        # A reindex rewrites the current version; redeliveries do not.
        if order == 0 and stored.indexed and not replace:
            return "duplicate"

    return "write"


def clear_allowed(stored: StoredVersion | None, incoming: ObjectVersion) -> bool:
    if stored is None:
        return True

    if stored.deleted:
        return False

    if stored.sequencer:
        return compare_sequencers(incoming.sequencer, stored.sequencer) >= 0

    return True
