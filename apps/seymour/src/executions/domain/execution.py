"""Execution claim rules and transport-independent progress snapshots."""

from dataclasses import dataclass


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
        if self.status in {"completed", "cancelled", "timed_out"}:
            return "terminal"
        if self.status != "running":
            raise RuntimeError("Execution is busy or permanently failed")

        tutor = "mode" in self.context
        analysis = self.context.get("kind") == "analysis" and "attemptId" in self.context
        expected_budget = 8000 if tutor or analysis else 1000
        if self.budget != expected_budget or self.context["kind"] not in {"chat", "analysis"}:
            raise ValueError("Invalid authorized execution context")

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
