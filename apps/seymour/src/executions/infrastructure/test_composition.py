import json
from pathlib import Path
from uuid import uuid4

import pytest

from src.executions.infrastructure.composition import run_job

pytestmark = pytest.mark.unit

FIXTURE_PATH = Path(__file__).parents[3] / "tests/fixtures/executions.json"
FIXTURE = json.loads(FIXTURE_PATH.read_text())


def test_streams_cumulative_snapshots_before_completion_without_model_usage():
    execution_id = str(uuid4())
    lease = str(uuid4())
    events = []
    calls = []

    def control(request):
        calls.append(request)
        if request["action"] == "claim":
            return {"status": "running", "lease": lease, "input": {"kind": "chat"}, "budget": 1000}

        return {"active": True}

    run_job({"version": 1, "executionId": execution_id}, control, events.append, lambda _: None)

    assert [event["status"] for event in events] == ["running", "running", "completed"]
    assert [event["index"] for event in events] == [1, 2, 3]
    assert events[2]["text"].startswith(events[1]["text"])
    assert all(event["tokens"] == 0 and event["lease"] == lease for event in events)
    assert len(calls) == 4


def test_cancelled_attempt_reports_usage_without_more_work():
    events = []

    def control(request):
        if request["action"] == "claim":
            return {
                "status": "running",
                "lease": str(uuid4()),
                "input": {"kind": "analysis"},
                "budget": 1000,
            }

        return {"active": False}

    run_job({"version": 1, "executionId": str(uuid4())}, control, events.append)

    assert len(events) == 1
    assert events[0]["index"] == 100
    assert events[0]["tokens"] == 0
    assert events[0]["text"] == ""


@pytest.mark.parametrize("status", ["completed", "cancelled", "timed_out"])
def test_terminal_redelivery_has_no_effect(status):
    events = []

    run_job(
        {"version": 1, "executionId": str(uuid4())}, lambda _: {"status": status}, events.append
    )

    assert events == []


@pytest.mark.parametrize("status", ["busy", "failed"])
def test_busy_and_failed_jobs_are_returned_to_sqs_for_redrive(status):
    with pytest.raises(RuntimeError):
        run_job(
            {"version": 1, "executionId": str(uuid4())},
            lambda _: {"status": status},
            lambda _: None,
        )


def test_failed_publish_reports_attempt_failure_and_rethrows():
    calls = []

    def control(request):
        calls.append(request["action"])
        if request["action"] == "claim":
            return {
                "status": "running",
                "lease": str(uuid4()),
                "input": {"kind": "chat"},
                "budget": 1000,
            }

        return {"active": True}

    def broken_publish(_):
        raise RuntimeError("SQS unavailable")

    with pytest.raises(RuntimeError):
        run_job({"version": 1, "executionId": str(uuid4())}, control, broken_publish)

    assert calls == ["claim", "active", "failed"]


def test_real_worker_emits_the_pinned_transport_and_cancellation_events():
    events = []
    active = True

    def control(request):
        if request["action"] == "claim":
            return {
                "status": "running",
                "lease": FIXTURE["running"]["lease"],
                "input": {"kind": "chat"},
                "budget": 1000,
            }

        return {"active": active}

    run_job(FIXTURE["incoming"], control, events.append, lambda _: None)

    assert events[0] == FIXTURE["running"]
    assert events[-1] == FIXTURE["completed"]

    active = False
    events.clear()

    run_job(FIXTURE["incoming"], control, events.append)

    assert events == [FIXTURE["cancelled"]]


def test_tutor_composition_supplies_its_schema_and_safe_tool_names(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from src.executions.infrastructure.composition import tutor_resources
    from src.tutor.application.guidance import guidance_schema
    from src.tutor.application.tools import TOOL_ARGUMENTS

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("LANGFUSE_BASE_URL", "http://localhost")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "test-public")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "test-secret")
    monkeypatch.setattr("src.shared.infrastructure.tracing.Langfuse", lambda **_: MagicMock())
    monkeypatch.delenv("SESSIONS_TABLE", raising=False)
    snapshot = SimpleNamespace(sources=[], foldTurns=[])
    folding = SimpleNamespace(sources=[], foldTurns=[{"prompt": "a", "answer": "b"}])

    runtime = tutor_resources(snapshot)
    compacting = tutor_resources(folding)

    assert runtime.model.response_name == "tutor_guidance"
    assert runtime.model.response_schema == guidance_schema()
    assert runtime.trace.tool_names == frozenset(TOOL_ARGUMENTS)
    assert runtime.search is None
    assert runtime.summarizer is None
    assert runtime.checkpoints is None
    assert compacting.summarizer.response_name == "conversation_summary"


def test_an_unavailable_checkpoint_store_disables_resume_instead_of_failing(monkeypatch):
    from src.executions.infrastructure.composition import checkpoint_store

    def broken(*_args, **_kwargs):
        raise RuntimeError("no region")

    monkeypatch.setenv("SESSIONS_TABLE", "papert-sessions")
    monkeypatch.setattr(
        "src.executions.infrastructure.dynamo_checkpoints.DynamoCheckpoints.__init__", broken
    )

    assert checkpoint_store() is None
