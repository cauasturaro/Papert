"""Bounded provider fallback: what to do after a call failed, and how long a call may take."""

from dataclasses import dataclass
from typing import Literal

from src.shared.domain.inference import UnavailableReason

# One extra call on the same provider, only for transient rate-limit and server errors.
MAX_SAME_PROVIDER_RETRIES = 1
# A longer Retry-After means the provider will not recover within this attempt.
MAX_RETRY_WAIT_SECONDS = 2.0
DEFAULT_RETRY_WAIT_SECONDS = 0.5
# Below this, a model call cannot finish, so starting one only wastes tokens.
MIN_CALL_SECONDS = 4.0
# With a fallback left, the current provider gets this share of the remaining time.
CURRENT_PROVIDER_SHARE = 0.6


@dataclass(frozen=True)
class FallbackStep:
    action: Literal["retry", "switch", "fail"]
    wait: float = 0.0


def next_step(
    reason: UnavailableReason,
    retry_after: float | None,
    retries: int,
    has_next: bool,
    seconds_left: float,
) -> FallbackStep:
    # A timeout already used this provider's time share, so it is never retried in place.
    transient = reason != "timeout" and retries < MAX_SAME_PROVIDER_RETRIES

    if transient:
        wait = DEFAULT_RETRY_WAIT_SECONDS if retry_after is None else max(0.0, retry_after)

        if wait <= MAX_RETRY_WAIT_SECONDS and seconds_left - wait >= MIN_CALL_SECONDS:
            return FallbackStep("retry", wait)

    if has_next and seconds_left >= MIN_CALL_SECONDS:
        return FallbackStep("switch")

    return FallbackStep("fail")


def call_deadline(now: float, deadline: float, has_next: bool) -> float:
    """Leave the fallback enough time to answer when the current provider hangs."""
    remaining = deadline - now

    if not has_next or remaining * (1 - CURRENT_PROVIDER_SHARE) < MIN_CALL_SECONDS:
        return deadline

    return now + remaining * CURRENT_PROVIDER_SHARE
