from dataclasses import replace

import pytest

from src.executions.application.worker import run_execution
from src.executions.domain.execution import Claim, Execution, Result

pytestmark = pytest.mark.unit

EXECUTION_ID = "execution-1"
CONTEXT = {"kind": "analysis", "attemptId": "attempt-1"}


class FakeControl:
    def __init__(self, leases):
        self.leases = list(leases)
        self.failures = []

    def claim(self, execution_id):
        return Claim("running", self.leases.pop(0), CONTEXT, 8000)

    def active(self, execution_id, lease):
        return True

    def failed(self, execution_id, lease):
        self.failures.append(lease)

    def live_sources(self, execution_id, lease):
        return []


class MemoryResults:
    def __init__(self):
        self.items = {}

    def stage(self, result):
        self.items[result.execution_id] = result

    def staged(self, execution_id):
        return self.items.get(execution_id)

    def clear(self, execution_id):
        self.items.pop(execution_id, None)


class FlakyPublisher:
    """Fails the first final result, as a results-queue outage would."""

    def __init__(self):
        self.sent = []
        self.failed_once = False

    def __call__(self, result):
        if result.is_final() and not self.failed_once:
            self.failed_once = True
            raise RuntimeError("SQS unavailable")

        self.sent.append(result)


def unused(*_args):
    raise AssertionError("unexpected workflow")


def run(control, publish, analysis, results):
    run_execution(
        Execution(EXECUTION_ID),
        control,
        publish,
        unused,
        analysis,
        unused,
        unused,
        lambda _seconds: None,
        results,
    )


def test_a_failed_publication_is_replayed_without_another_inference():
    control = FakeControl(["lease-1"])
    publish = FlakyPublisher()
    results = MemoryResults()
    inferences = []

    def analysis(execution_id, lease, context, budget, control, send):
        inferences.append(lease)
        send(Result(execution_id, lease, 1, "running", "Checking…", 100))
        send(Result(execution_id, lease, 100, "completed", "Two criteria met.", 900))

    with pytest.raises(RuntimeError, match="SQS unavailable"):
        run(control, publish, analysis, results)

    run(control, publish, analysis, results)

    final = publish.sent[-1]
    assert inferences == ["lease-1"]
    assert control.failures == []
    assert final == Result(EXECUTION_ID, "lease-1", 100, "completed", "Two criteria met.", 900)
    assert results.items == {}


def test_a_published_result_is_not_kept():
    control = FakeControl(["lease-1"])
    sent = []
    results = MemoryResults()
    final = Result(EXECUTION_ID, "lease-1", 100, "failed", "Models unavailable.", 40)

    def analysis(execution_id, lease, context, budget, control, send):
        send(final)

    run(control, sent.append, analysis, results)

    assert sent == [final]
    assert results.items == {}


def test_progress_results_are_never_staged():
    progress = Result(EXECUTION_ID, "lease-1", 1, "running", "Checking…", 100)

    assert progress.is_final() is False
    assert replace(progress, index=100, status="completed").is_final() is True


@pytest.mark.parametrize("status", ["completed", "cancelled", "timed_out", "failed"])
def test_terminal_claims_do_nothing_and_are_not_retried(status):
    class TerminalControl(FakeControl):
        def claim(self, execution_id):
            return Claim(status)

    sent = []
    control = TerminalControl([])

    run(control, sent.append, unused, MemoryResults())

    assert sent == []
    assert control.failures == []


def test_replay_failure_keeps_the_original_result_without_claiming_or_failing():
    control = FakeControl([])
    results = MemoryResults()
    final = Result(EXECUTION_ID, "lease-1", 100, "completed", "Answer", 900)
    results.stage(final)

    with pytest.raises(RuntimeError, match="SQS unavailable"):
        run(control, FlakyPublisher(), unused, results)

    assert results.staged(EXECUTION_ID) == final
    assert control.failures == []


def test_inference_failure_still_releases_the_claim():
    control = FakeControl(["lease-1"])

    with pytest.raises(AssertionError, match="unexpected workflow"):
        run(control, lambda _: None, unused, MemoryResults())

    assert control.failures == ["lease-1"]
