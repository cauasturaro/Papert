from uuid import uuid4

import pytest

from src.executions.worker import run_job


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


def test_lambda_reports_only_failed_batch_items(monkeypatch):
    from src.executions.infrastructure import sqs as worker_handler

    seen = []

    def run(message):
        seen.append(message["id"])
        if message["id"] == "bad":
            raise ValueError("invalid envelope")

    monkeypatch.setattr(worker_handler, "run_single_execution", run)
    records = [{"messageId": key, "body": '{"id":"' + key + '"}'} for key in ["bad", "good"]]

    result = worker_handler.handler({"Records": records}, None)

    assert result == {"batchItemFailures": [{"itemIdentifier": "bad"}]}
    assert seen == ["bad", "good"]
