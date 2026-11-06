import pytest

from src.shared.application.fallback_model import FallbackModel, Provider, Route
from src.shared.domain.inference import Message, ModelUnavailable

pytestmark = pytest.mark.unit


class FakeModel:
    """Fails with the queued errors, then answers; records the budget and deadline it got."""

    def __init__(self, name, failures=()):
        self.name = name
        self.failures = list(failures)
        self.calls = []

    def complete(self, messages, tools, effort, remaining, deadline, active):
        self.calls.append({"remaining": remaining, "deadline": deadline})

        if self.failures:
            raise self.failures.pop(0)

        return Message(
            role="assistant",
            content=f'{{"from": "{self.name}"}}',
            usage={"input_tokens": 100, "output_tokens": 20, "total_tokens": 120},
        )


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def chain(primary, fallback=None, route=None):
    providers = [Provider("openai", primary)]
    if fallback is not None:
        providers.append(Provider("deepseek", fallback))

    events = []
    waits = []
    model = FallbackModel(providers, route or Route(), Clock(), waits.append, events.append)

    return model, events, waits


def complete(model, remaining=8000, deadline=20.0):
    return model.complete([], [], "low", remaining, deadline, lambda: True)


def test_a_healthy_primary_answers_without_fallback():
    primary = FakeModel("openai")
    fallback = FakeModel("deepseek")
    model, events, _waits = chain(primary, fallback)

    response = complete(model)

    assert response.content == '{"from": "openai"}'
    assert fallback.calls == []
    assert events == []


def test_rate_limit_retries_once_then_switches_and_stays_on_the_fallback():
    route = Route()
    primary = FakeModel(
        "openai",
        [ModelUnavailable("rate_limited"), ModelUnavailable("rate_limited")],
    )
    fallback = FakeModel("deepseek")
    model, events, waits = chain(primary, fallback, route)

    first = complete(model)
    second = complete(model)

    assert first.content == '{"from": "deepseek"}'
    assert second.content == '{"from": "deepseek"}'
    assert len(primary.calls) == 2
    assert len(fallback.calls) == 2
    assert waits == [0.5]
    assert route.active == 1
    assert [event["action"] for event in events] == ["retry", "switch"]


def test_a_timeout_charges_its_reservation_and_shrinks_the_fallback_budget():
    primary = FakeModel("openai", [ModelUnavailable("timeout", charged=3000)])
    fallback = FakeModel("deepseek")
    model, _events, _waits = chain(primary, fallback)

    response = complete(model, remaining=8000)

    assert fallback.calls[0]["remaining"] == 5000
    assert response.usage == {"input_tokens": 3100, "output_tokens": 20, "total_tokens": 3120}


def test_the_primary_gets_only_its_share_of_the_time_when_a_fallback_exists():
    primary = FakeModel("openai")
    model, _events, _waits = chain(primary, FakeModel("deepseek"))

    complete(model, deadline=20.0)

    assert primary.calls[0]["deadline"] == pytest.approx(12.0)


def test_total_failure_raises_with_everything_charged():
    primary = FakeModel("openai", [ModelUnavailable("timeout", charged=3000)])
    fallback = FakeModel(
        "deepseek",
        [ModelUnavailable("server_error"), ModelUnavailable("server_error")],
    )
    model, events, _waits = chain(primary, fallback)

    with pytest.raises(ModelUnavailable) as failure:
        complete(model)

    assert failure.value.reason == "server_error"
    assert failure.value.charged == 3000
    assert [event["action"] for event in events] == ["switch", "retry", "fail"]


def test_request_errors_are_not_retried_or_switched():
    primary = FakeModel("openai", [RuntimeError("Model request rejected with status 400")])
    fallback = FakeModel("deepseek")
    model, _events, _waits = chain(primary, fallback)

    with pytest.raises(RuntimeError, match="400"):
        complete(model)

    assert fallback.calls == []


def test_the_answer_keeps_its_identity_for_provider_replay():
    primary = FakeModel("openai", [ModelUnavailable("timeout", charged=10)])
    fallback = FakeModel("deepseek")
    model, _events, _waits = chain(primary, fallback)
    returned = []
    original = fallback.complete

    def capture(*args):
        message = original(*args)
        returned.append(message)

        return message

    fallback.complete = capture

    response = complete(model)

    assert response is returned[0]
