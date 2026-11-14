"""Checkpoint load and save for a leased tutor run; the store itself is best effort."""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.executions.domain.checkpoint import Checkpoint, CheckpointScope, resumable
from src.executions.domain.ports import Checkpoints, Control

if TYPE_CHECKING:
    from src.tutor.domain.context import TutorContext


def tutor_scope(snapshot: TutorContext) -> CheckpointScope:
    return CheckpointScope(snapshot.sessionId, snapshot.workspaceId, snapshot.conversationId)


def _memory_ids(snapshot: TutorContext) -> list[str]:
    return [note.id for note in snapshot.memory]


def resume_state(
    store: Checkpoints | None,
    control: Control,
    execution_id: str,
    lease: str,
    snapshot: TutorContext,
) -> dict | None:
    """The saved state of an earlier attempt, if it is still safe to continue from."""
    if store is None:
        return None

    saved = store.load(execution_id)
    if saved is None:
        return None

    # Claimed snapshots already exclude deleted notes; sources are checked live with Core.
    live = set(control.live_sources(execution_id, lease)) if saved.source_ids else set()
    memory_ids = set(_memory_ids(snapshot))

    if not resumable(saved, tutor_scope(snapshot), live, memory_ids):
        return None

    return saved.state


def checkpoint_saver(
    store: Checkpoints | None, execution_id: str, lease: str, snapshot: TutorContext
):
    def save(step: int, state: dict) -> None:
        if store is None:
            return

        retrieved = state.get("retrieved", [])
        source_ids = sorted({excerpt["sourceId"] for excerpt in retrieved})
        checkpoint = Checkpoint(
            execution_id,
            lease,
            step,
            tutor_scope(snapshot),
            state,
            source_ids,
            _memory_ids(snapshot),
        )

        store.save(checkpoint)

    return save


def forget(store: Checkpoints | None, execution_id: str) -> None:
    if store is not None:
        store.delete(execution_id)
