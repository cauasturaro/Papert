import pytest

from src.shared.application.bounded_call import Answered, InvalidUsage, Stopped, bounded_call
from src.shared.domain.inference import BudgetExceeded, Message, ModelUnavailable, TutorCancelled

pytestmark = pytest.mark.unit

DEADLINE = 50.0


class FakeModel:
    def __init__(self, outcome):
        self.outcome = outcome

    def complete(self, messages, tools, effort, remaining, deadline, active):
        if isinstance(self.outcome, Exception):
            raise self.outcome

        return self.outcome


def call(outcome, now=10.0, remaining=1000):
    return bounded_call(
        FakeModel(outcome), [], [], "low", remaining, DEADLINE, lambda: True, lambda: now
    )


def answer(total):
    usage = {"input_tokens": total - 10, "output_tokens": 10, "total_tokens": total}

    return Message(role="assistant", content="{}", usage=usage)


def test_an_answer_reports_its_tokens():
    response = answer(300)

    outcome = call(response)

    assert outcome == Answered(response, 300)


@pytest.mark.parametrize(
    "failure,now,expected",
    [
        (TutorCancelled(), 10.0, Stopped("cancelled")),
        (BudgetExceeded(), 10.0, Stopped("budget")),
        (ModelUnavailable("timeout", charged=40), DEADLINE, Stopped("deadline", 40)),
        (ModelUnavailable("timeout", charged=40), 10.0, Stopped("unavailable", 40)),
        (ModelUnavailable("rate_limited"), DEADLINE, Stopped("unavailable")),
    ],
)
def test_failures_are_classified_with_their_charge(failure, now, expected):
    outcome = call(failure, now=now)

    assert outcome == expected


@pytest.mark.parametrize("response", [Message(role="assistant", content="{}"), answer(1001)])
def test_missing_or_excess_usage_is_an_error(response):
    with pytest.raises(InvalidUsage):
        call(response)


def test_request_errors_propagate_unchanged():
    rejected = RuntimeError("Model request rejected with status 400")

    with pytest.raises(RuntimeError) as failure:
        call(rejected)

    assert failure.value is rejected
