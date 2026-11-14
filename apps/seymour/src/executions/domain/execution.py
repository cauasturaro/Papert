"""Execution claim rules and transport-independent progress snapshots."""

from dataclasses import dataclass

# Core settled these executions; a redelivered message for one of them has nothing left to do.
TERMINAL_STATUSES = {"completed", "cancelled", "timed_out", "failed"}
FINAL_INDEX = 100


@dataclass(frozen=True)
class Execution:
    id: str


@dataclass(frozen=True)
class Claim:
    status: str
    lease: str | None = None
    context: dict | None = None
    budget: int | None = None

    def workflow(self) -> str:
        if self.status in TERMINAL_STATUSES:
            return "terminal"
        if self.status != "running":
            # Another worker holds the lease; the queue redelivers the message later.
            raise RuntimeError(f"Execution cannot be claimed while {self.status}")

        if self.context is None:
            raise ValueError("Invalid authorized execution context")

        kind = self.context["kind"]
        tutor = "mode" in self.context
        analysis = kind == "analysis" and "attemptId" in self.context
        generation = kind == "generation"
        recommendation = kind == "recommendation"

        expected_budget = 1000
        if tutor or analysis or recommendation:
            expected_budget = 8000
        if generation:
            expected_budget = 16000

        kinds = {"chat", "analysis", "generation", "recommendation"}
        if self.budget != expected_budget or kind not in kinds:
            raise ValueError("Invalid authorized execution context")

        if recommendation:
            return "recommendation"
        if generation:
            return "generation"
        if analysis:
            return "analysis"
        if tutor:
            return "tutor"

        return "transport"


@dataclass(frozen=True)
class Result:
    execution_id: str
    lease: str
    index: int
    status: str
    text: str
    tokens: int
    evaluation: dict | None = None
    # Tutor answers in workspaces with sources: support and citations; Core re-authorizes them.
    grounding: dict | None = None
    # Generation only: the drafted definition and private evidence; Core validates both.
    roadmap: dict | None = None
    # Recommendation only: published roadmaps close to the goal; Core re-authorizes them.
    recommendation: dict | None = None
    # Tutor only: a folded conversation summary and a durable-note proposal; Core validates both.
    memory: dict | None = None

    def is_final(self) -> bool:
        return self.index == FINAL_INDEX and self.status != "running"
