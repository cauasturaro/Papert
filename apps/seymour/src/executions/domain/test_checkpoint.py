import pytest

from src.executions.domain.checkpoint import Checkpoint, CheckpointScope, resumable

pytestmark = pytest.mark.unit

SCOPE = CheckpointScope("session", "workspace", "conversation")


def test_missing_checkpoint_cannot_resume():
    assert resumable(None, SCOPE, set(), set()) is False


@pytest.mark.parametrize(
    "scope",
    [
        CheckpointScope("other", "workspace", "conversation"),
        CheckpointScope("session", "other", "conversation"),
        CheckpointScope("session", "workspace", "other"),
    ],
)
def test_checkpoint_cannot_resume_in_another_scope(scope):
    checkpoint = Checkpoint("execution", "lease", 1, SCOPE, {})

    assert resumable(checkpoint, scope, set(), set()) is False


def test_checkpoint_with_deleted_source_cannot_resume():
    checkpoint = Checkpoint("execution", "lease", 1, SCOPE, {}, ["deleted"], [])

    assert resumable(checkpoint, SCOPE, {"live"}, set()) is False


def test_checkpoint_with_deleted_memory_cannot_resume():
    checkpoint = Checkpoint("execution", "lease", 1, SCOPE, {}, [], ["deleted"])

    assert resumable(checkpoint, SCOPE, set(), {"live"}) is False


def test_checkpoint_resumes_when_scope_and_references_remain_live():
    checkpoint = Checkpoint("execution", "lease", 1, SCOPE, {}, ["source"], ["memory"])

    assert resumable(checkpoint, SCOPE, {"source", "other"}, {"memory", "other"}) is True
