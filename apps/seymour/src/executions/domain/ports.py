"""Ports for the leased execution use case."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from typing import Protocol, TypeVar

from src.executions.domain.checkpoint import Checkpoint
from src.executions.domain.execution import Claim, Result

T = TypeVar("T")


class Control(Protocol):
    def claim(self, execution_id: str) -> Claim: ...
    def active(self, execution_id: str, lease: str) -> bool: ...
    def failed(self, execution_id: str, lease: str) -> None: ...
    def live_sources(self, execution_id: str, lease: str) -> list[str]:
        """Snapshot sources that are still ready now; deleted ones drop out mid-run."""


class Checkpoints(Protocol):
    """Best-effort store: an unavailable store behaves as empty and never raises."""

    def load(self, execution_id: str) -> Checkpoint | None: ...

    def save(self, checkpoint: Checkpoint) -> bool:
        """Stores the checkpoint unless a step at least as high is stored; False when skipped."""

    def delete(self, execution_id: str) -> None: ...


class Publisher(Protocol):
    def __call__(self, result: Result) -> None: ...


class TutorRunner(Protocol):
    def __call__(
        self,
        execution_id: str,
        lease: str,
        context: dict,
        budget: int,
        control: Control,
        publish: Publisher,
    ) -> None: ...


class EvaluationRunner(TutorRunner, Protocol):
    pass


class GenerationRunner(TutorRunner, Protocol):
    pass


class RecommendationRunner(TutorRunner, Protocol):
    pass


Pause = Callable[[float], None]


class ExecutionMeasurements(Protocol):
    def record_metadata(self, metadata: dict) -> None: ...


class ExecutionTracer(Protocol):
    def execution(
        self, execution_id: str, session_id: str, name: str = "seymour-tutor"
    ) -> AbstractContextManager[ExecutionMeasurements]: ...

    def tool(self, name: str, action: Callable[[], T]) -> T: ...

    def retrieval(self, action: Callable[[], T]) -> T: ...
