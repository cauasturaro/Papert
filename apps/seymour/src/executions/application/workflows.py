"""Workflow execution and progress reporting with injected runtime resources."""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from src.executions.application.resources import ExecutionResources
from src.executions.domain.execution import Result
from src.executions.domain.ports import Control, Publisher

if TYPE_CHECKING:
    from src.roadmap.domain.roadmap import GenerationContext


def live_search(runtime: ExecutionResources, control: Control, execution_id, lease):
    """Search wrapper that asks Core for the still-ready sources before every lookup."""
    if runtime.search is None:
        return None

    source_search = runtime.search

    def search(query, document_ids):
        # Core re-authorizes before every lookup, so a source deleted mid-run is never searched.
        live = set(control.live_sources(execution_id, lease))
        allowed = [document_id for document_id in document_ids if document_id in live]

        if not allowed:
            return [], 0

        return runtime.trace.retrieval(lambda: source_search(query, allowed))

    return search


def grounding_measurements(grounding: dict | None) -> dict:
    """Trace-safe summary: support and cited document ids/locations, never source text."""
    if grounding is None:
        return {}

    cited = [
        {"sourceId": citation["sourceId"], "location": citation["location"]}
        for citation in grounding["citations"]
    ]

    return {"sourceSupport": grounding["support"], "citations": cited}


UNAVAILABLE_ANALYSIS = (
    "Seymour's AI models are not responding right now. Your progress did not change; "
    "analyze again in a minute."
)
UNAVAILABLE_GENERATION = (
    "Seymour's AI models are not responding right now. Nothing was saved; try again in a minute."
)


def final_status(reason: str) -> str:
    """Every provider failing ends the execution as failed, an explicit state for Core."""
    return "failed" if reason == "unavailable" else "completed"


ANALYSIS_MESSAGES = {
    "budget": "The saved files exceed this analysis budget. Reduce the workspace and analyze again.",
    "invalid": "Seymour could not produce a valid evaluation. Your progress did not change; analyze again.",
    "deadline": "The analysis time limit was reached. Your progress did not change; analyze again.",
    "unavailable": UNAVAILABLE_ANALYSIS,
    "cancelled": "",
}


def run_analysis_job(
    execution_id,
    lease,
    context,
    budget,
    control: Control,
    publish: Publisher,
    resources: Callable[[], ExecutionResources],
):
    from src.evaluation.application.evaluator import run_analysis, summary_text
    from src.evaluation.domain.evaluation import AnalysisContext

    snapshot = AnalysisContext.model_validate(
        {key: context[key] for key in AnalysisContext.model_fields if key in context}
    )

    runtime = resources()
    index = 0

    def active():
        return control.active(execution_id, lease)

    def progress(text, tokens):
        nonlocal index
        index += 1

        publish(Result(execution_id, lease, index, "running", text, tokens))

    with runtime.trace.execution(execution_id, snapshot.sessionId, "seymour-evaluation") as span:
        result = run_analysis(
            snapshot,
            context.get("effort", "medium"),
            budget,
            runtime.model,
            active,
            progress,
            clock=runtime.clock,
        )
        span.record_metadata(
            {
                "calls": result["calls"],
                "tokens": result["tokens"],
                "reason": result["reason"],
            }
        )

        text = ANALYSIS_MESSAGES.get(result["reason"], "")
        evaluation = None
        if result["evaluation"] is not None:
            text = summary_text(result["evaluation"])
            evaluation = result["evaluation"].model_dump()

        status = final_status(result["reason"])

        publish(Result(execution_id, lease, 100, status, text, result["tokens"], evaluation))


GENERATION_MESSAGES = {
    "budget": "The roadmap did not fit this generation budget. Shorten the goal and try again.",
    "invalid": "Seymour could not produce a valid roadmap. Nothing was saved; try again.",
    "deadline": "The generation time limit was reached. Nothing was saved; try again.",
    "unavailable": UNAVAILABLE_GENERATION,
    "cancelled": "",
}


def run_generation_job(
    execution_id,
    lease,
    context,
    budget,
    control: Control,
    publish: Publisher,
    resources: Callable[[GenerationContext], ExecutionResources],
):
    from src.roadmap.application.generator import run_generation, summary_text
    from src.roadmap.domain.roadmap import GenerationContext

    snapshot = GenerationContext.model_validate(
        {key: context[key] for key in GenerationContext.model_fields if key in context}
    )

    runtime = resources(snapshot)
    search = live_search(runtime, control, execution_id, lease)
    index = 0

    def active():
        return control.active(execution_id, lease)

    def progress(text, tokens):
        nonlocal index
        index += 1

        publish(Result(execution_id, lease, index, "running", text, tokens))

    with runtime.trace.execution(execution_id, snapshot.sessionId, "seymour-roadmap") as span:
        result = run_generation(
            snapshot,
            context.get("effort", "low"),
            budget,
            runtime.model,
            active,
            progress,
            search,
            clock=runtime.clock,
        )
        roadmap = result["roadmap"]

        span.record_metadata(
            {
                "calls": result["calls"],
                "tokens": result["tokens"],
                "reason": result["reason"],
                **generation_measurements(roadmap, result["excerpts"]),
            }
        )

        text = GENERATION_MESSAGES.get(result["reason"], "")
        if roadmap is not None:
            text = summary_text(roadmap)

        publish(
            Result(
                execution_id,
                lease,
                100,
                final_status(result["reason"]),
                text,
                result["tokens"],
                roadmap=roadmap,
            )
        )


def generation_measurements(roadmap: dict | None, excerpts: list[dict]) -> dict:
    """Trace-safe counts and source ids; titles, goals and source text stay out of traces."""
    measurements = {
        "excerpts": len(excerpts),
        "consultedSources": sorted({excerpt["sourceId"] for excerpt in excerpts}),
    }

    if roadmap is None:
        return measurements

    evidence = roadmap["evidence"]

    return {
        **measurements,
        "steps": len(roadmap["definition"]["steps"]),
        "evidence": len(evidence),
        "citedSources": sorted({item["sourceId"] for item in evidence}),
    }
