from unittest.mock import MagicMock

import pytest

from src.executions.application.checkpointing import checkpoint_saver, resume_state
from src.executions.domain.checkpoint import Checkpoint, CheckpointScope
from src.tutor.domain.context import TutorContext

pytestmark = pytest.mark.unit

SOURCE = "11111111-1111-4111-8111-111111111111"
NOTE = "33333333-3333-4333-8333-333333333333"
WORKSPACE = "44444444-4444-4444-8444-444444444444"


def snapshot(memory=True):
    return TutorContext(
        sessionId="session-a",
        stepId="validate-input",
        objective="Learn HTTP",
        stepTitle="Validate input",
        files={"main.ts": "const input = {};"},
        challenge={
            "instructions": "Validate input",
            "criteria": [{"id": "name", "description": "Reject an empty name"}],
        },
        workspaceId=WORKSPACE,
        sources=[{"id": SOURCE, "filename": "guide.pdf", "format": "pdf"}],
        conversationId="conversation-a",
        memory=[{"id": NOTE, "kind": "preference", "text": "Short answers"}] if memory else [],
    )


def saved(**overrides):
    values = {
        "execution_id": "execution",
        "lease": "old-lease",
        "step": 2,
        "scope": CheckpointScope("session-a", WORKSPACE, "conversation-a"),
        "state": {"calls": 1, "messages": []},
        "source_ids": [SOURCE],
        "memory_ids": [NOTE],
    }

    return Checkpoint(**{**values, **overrides})


def control(live):
    fake = MagicMock()
    fake.live_sources.return_value = live

    return fake


def test_a_checkpoint_resumes_in_its_scope_with_live_sources_and_notes():
    store = MagicMock()
    store.load.return_value = saved()

    state = resume_state(store, control([SOURCE]), "execution", "new-lease", snapshot())

    assert state == {"calls": 1, "messages": []}


@pytest.mark.parametrize(
    ("checkpoint", "live", "context"),
    [
        (saved(), [], snapshot()),
        (saved(), [SOURCE], snapshot(memory=False)),
    ],
    ids=["deleted-source", "deleted-note"],
)
def test_a_checkpoint_is_checked_against_live_sources_and_admitted_notes(checkpoint, live, context):
    store = MagicMock()
    store.load.return_value = checkpoint

    state = resume_state(store, control(live), "execution", "new-lease", context)

    assert state is None


def test_saved_checkpoints_record_the_sources_and_notes_they_contain():
    store = MagicMock()
    retrieved = [{"sourceId": SOURCE, "cite": "guide.pdf, p. 1"}]

    checkpoint_saver(store, "execution", "lease", snapshot())(3, {"retrieved": retrieved})

    checkpoint = store.save.call_args.args[0]
    assert checkpoint.step == 3
    assert checkpoint.lease == "lease"
    assert checkpoint.source_ids == [SOURCE]
    assert checkpoint.memory_ids == [NOTE]
    assert checkpoint.scope == CheckpointScope("session-a", WORKSPACE, "conversation-a")
