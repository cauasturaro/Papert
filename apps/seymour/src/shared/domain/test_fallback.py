import pytest

from src.shared.domain.fallback import (
    MIN_CALL_SECONDS,
    FallbackStep,
    call_deadline,
    next_step,
)

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("reason", ["rate_limited", "server_error"])
def test_transient_errors_retry_once_on_the_same_provider(reason):
    first = next_step(reason, None, retries=0, has_next=True, seconds_left=15)
    second = next_step(reason, None, retries=1, has_next=True, seconds_left=15)

    assert first == FallbackStep("retry", 0.5)
    assert second == FallbackStep("switch")


def test_a_timeout_switches_without_retrying_in_place():
    step = next_step("timeout", None, retries=0, has_next=True, seconds_left=15)

    assert step == FallbackStep("switch")


def test_a_long_retry_after_switches_instead_of_waiting():
    step = next_step("rate_limited", 30.0, retries=0, has_next=True, seconds_left=15)

    assert step == FallbackStep("switch")


def test_a_short_retry_after_is_honored():
    step = next_step("rate_limited", 1.5, retries=0, has_next=True, seconds_left=15)

    assert step == FallbackStep("retry", 1.5)


def test_without_a_fallback_the_failure_is_final_after_the_retry():
    step = next_step("server_error", None, retries=1, has_next=False, seconds_left=15)

    assert step == FallbackStep("fail")


def test_no_call_starts_when_it_could_not_finish():
    retry = next_step("server_error", None, retries=0, has_next=True, seconds_left=4.2)
    switch = next_step("timeout", None, retries=0, has_next=True, seconds_left=3.0)

    assert retry == FallbackStep("switch")
    assert switch == FallbackStep("fail")


def test_the_current_provider_leaves_time_for_the_fallback():
    limit = call_deadline(now=100.0, deadline=120.0, has_next=True)

    assert limit == pytest.approx(112.0)
    assert 120.0 - limit >= MIN_CALL_SECONDS


def test_the_last_provider_gets_all_remaining_time():
    assert call_deadline(now=100.0, deadline=120.0, has_next=False) == 120.0


def test_a_short_window_is_not_split():
    assert call_deadline(now=100.0, deadline=108.0, has_next=True) == 108.0
