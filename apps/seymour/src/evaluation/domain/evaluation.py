"""Evaluation contracts. Seymour reports per-criterion findings; only Core grants approval."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from src.tutor.domain.context import Challenge, StrictModel, TutorContext


class SyntaxCoverage(StrictModel):
    coverage: Literal["complete", "partial", "none"]
    checked: Annotated[list[dict], Field(max_length=20)]
    unchecked: Annotated[list[str], Field(max_length=20)]


class AnalysisContext(StrictModel):
    """Core-authorized snapshot of one attempt; files are untrusted learner data."""

    sessionId: Annotated[str, Field(min_length=1, max_length=100)]
    attemptId: Annotated[str, Field(min_length=36, max_length=36)]
    revision: Annotated[int, Field(ge=0)]
    stepId: Annotated[str, Field(min_length=1, max_length=100)]
    objective: Annotated[str, Field(min_length=1, max_length=8000)]
    stepTitle: Annotated[str, Field(min_length=1, max_length=8000)]
    files: dict[str, str]
    challenge: Challenge
    syntax: SyntaxCoverage

    @model_validator(mode="after")
    def validate_workspace(self):
        # Reuse the tutor's path, size and directory-marker rules for the same snapshot shape.
        TutorContext(
            sessionId=self.sessionId,
            stepId=self.stepId,
            objective=self.objective,
            stepTitle=self.stepTitle,
            files=self.files,
            challenge=self.challenge,
        )

        return self


class CriterionResult(StrictModel):
    id: Annotated[str, Field(min_length=1, max_length=200)]
    status: Literal["met", "not_met"]
    feedback: Annotated[str, Field(min_length=1, max_length=600)]


class Finding(StrictModel):
    category: Literal["logic", "contract", "structure", "security"]
    severity: Literal["info", "warning", "error"]
    path: Annotated[str, Field(max_length=200)] | None
    message: Annotated[str, Field(min_length=1, max_length=400)]


class ModelEvaluation(StrictModel):
    """What the model may produce. Attempt identity is attached by Seymour, never by the model."""

    summary: Annotated[str, Field(min_length=1, max_length=800)]
    criteria: Annotated[list[CriterionResult], Field(min_length=1, max_length=20)]
    findings: Annotated[list[Finding], Field(max_length=10)]
    hints: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=300)]], Field(min_length=1, max_length=3)
    ]


class Evaluation(ModelEvaluation):
    attemptId: Annotated[str, Field(min_length=36, max_length=36)]
    revision: Annotated[int, Field(ge=0)]
    stepId: Annotated[str, Field(min_length=1, max_length=100)]


def bind(result: ModelEvaluation, context: AnalysisContext) -> Evaluation:
    """Attach attempt identity and require exactly one result per snapshot criterion."""
    expected = sorted(criterion.id for criterion in context.challenge.criteria)
    reported = sorted(criterion.id for criterion in result.criteria)
    if reported != expected:
        raise ValueError("The evaluation must report each challenge criterion exactly once")

    # A finding may not point outside the attempt; an unknown path is dropped, not trusted.
    findings = [
        finding.model_dump()
        if finding.path is None or finding.path in context.files
        else {**finding.model_dump(), "path": None}
        for finding in result.findings
    ]

    return Evaluation(
        **{**result.model_dump(), "findings": findings},
        attemptId=context.attemptId,
        revision=context.revision,
        stepId=context.stepId,
    )
