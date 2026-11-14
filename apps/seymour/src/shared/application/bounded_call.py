"""One model call inside an execution's budget and deadline, classified once for every graph."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from src.shared.domain.inference import (
    BudgetExceeded,
    Message,
    Model,
    ModelUnavailable,
    TutorCancelled,
)

StopReason = Literal["cancelled", "budget", "deadline", "unavailable"]


class InvalidUsage(RuntimeError):
    """The provider reported no usage, or more than the call was admitted to spend."""


@dataclass(frozen=True)
class Answered:
    response: Message
    tokens: int


@dataclass(frozen=True)
class Stopped:
    reason: StopReason
    # Tokens the failed call may still have consumed; the attempt is charged for them.
    charged: int = 0


CallOutcome = Answered | Stopped


def bounded_call(
    model: Model,
    messages: list[Message],
    tools: list[dict],
    effort: str,
    remaining: int,
    deadline: float,
    active: Callable[[], bool],
    clock: Callable[[], float],
) -> CallOutcome:
    try:
        response = model.complete(messages, tools, effort, remaining, deadline, active)
    except TutorCancelled:
        return Stopped("cancelled")
    except BudgetExceeded:
        return Stopped("budget")
    except ModelUnavailable as failure:
        # A call cut off by the execution's own deadline ran out of time; the provider answered.
        if failure.reason == "timeout" and clock() >= deadline:
            return Stopped("deadline", failure.charged)

        return Stopped("unavailable", failure.charged)

    usage = response.usage
    if not usage or usage["total_tokens"] > remaining:
        raise InvalidUsage("Model usage is missing or exceeds the admitted budget")

    return Answered(response, usage["total_tokens"])
