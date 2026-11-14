"""In-flight execution state saved between graph steps, and the rule for resuming it."""

from dataclasses import dataclass, field

CHECKPOINT_TTL_SECONDS = 3600


@dataclass(frozen=True)
class CheckpointScope:
    session_id: str
    workspace_id: str | None
    conversation_id: str | None


@dataclass(frozen=True)
class Checkpoint:
    execution_id: str
    lease: str
    # Strictly increasing per execution; a store keeps only the highest step.
    step: int
    scope: CheckpointScope
    # JSON-serializable graph state owned by the workflow that wrote it.
    state: dict
    source_ids: list[str] = field(default_factory=list)
    memory_ids: list[str] = field(default_factory=list)


def resumable(
    checkpoint: Checkpoint | None,
    scope: CheckpointScope,
    live_source_ids: set[str],
    memory_ids: set[str],
) -> bool:
    """A checkpoint resumes only in its own scope and without deleted sources or memories."""
    if checkpoint is None:
        return False

    if checkpoint.scope != scope:
        return False

    if not set(checkpoint.source_ids) <= live_source_ids:
        return False

    return set(checkpoint.memory_ids) <= memory_ids
