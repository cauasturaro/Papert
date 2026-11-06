"""Inference contract shared by tutor, evaluation and roadmap generation."""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal, Protocol, TypedDict

from src.shared.domain.prompts import PromptFamily

UnavailableReason = Literal["timeout", "rate_limited", "server_error"]


class BudgetExceeded(Exception):
    pass


class TutorCancelled(Exception):
    pass


class ModelUnavailable(Exception):
    """No answer from the provider: timeout, rate limit, server error or lost connection.

    `charged` bounds the tokens the failed call may have consumed (a timed-out request can
    still be billed); rate-limit and server errors charge nothing.
    """

    def __init__(
        self,
        reason: UnavailableReason,
        charged: int = 0,
        retry_after: float | None = None,
    ):
        super().__init__(reason)

        self.reason = reason
        self.charged = charged
        self.retry_after = retry_after


class Usage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ToolCall(TypedDict):
    id: str
    name: str
    args: dict


@dataclass
class Message:
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: Usage | None = None
    tool_call_id: str | None = None
    name: str | None = None


@dataclass(frozen=True)
class ModelTask:
    """What a model call produces: response schema, prompt family and output reservations."""

    name: str
    schema: dict
    prompt: PromptFamily
    output_limits: dict[str, int] | None = None


class Model(Protocol):
    def complete(
        self,
        messages: list[Message],
        tools: list[dict],
        effort: str,
        remaining: int,
        deadline: float,
        active: Callable[[], bool],
    ) -> Message: ...


def final_text(response: Message) -> str:
    return response.content
