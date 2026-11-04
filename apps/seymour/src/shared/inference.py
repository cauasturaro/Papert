"""Application-owned inference contract shared by tutor and evaluation."""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal, Protocol, TypedDict


class BudgetExceeded(Exception):
    pass


class TutorCancelled(Exception):
    pass


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
