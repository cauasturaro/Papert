"""The tutor execution: resume or run the graph, publish the answer and its memory outcome."""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from src.executions.application.checkpointing import checkpoint_saver, forget, resume_state
from src.executions.application.resources import ExecutionResources
from src.executions.application.workflows import grounding_measurements, live_search
from src.executions.domain.execution import Result
from src.executions.domain.ports import Control, Publisher

if TYPE_CHECKING:
    from src.tutor.domain.context import TutorContext


def memory_outcome(result: dict) -> dict | None:
    """What Core records for the conversation (summary) and for the learner (proposal)."""
    outcome = {}

    if result["summary"] is not None:
        outcome["summary"] = result["summary"]

    if result["proposal"] is not None:
        outcome["proposal"] = result["proposal"]

    return outcome or None


def memory_measurements(snapshot: TutorContext, result: dict) -> dict:
    """Trace-safe facts about L2/L3 use: counts and flags, never summary or note text."""
    proposal = result["proposal"]

    return {
        "summarized": result["summarized"],
        "summaryFallback": result["summaryFallback"],
        "resumed": result["resumed"],
        "recentTurns": len(snapshot.recentTurns),
        "foldedTurns": len(snapshot.foldTurns),
        "memoryNotes": len(snapshot.memory),
        "proposal": proposal["kind"] if proposal else None,
    }


def run_tutor_job(
    execution_id,
    lease,
    context,
    budget,
    control: Control,
    publish: Publisher,
    resources: Callable[[TutorContext], ExecutionResources],
):
    from src.tutor.application.tutor import run_tutor
    from src.tutor.domain.context import TutorContext

    snapshot = TutorContext.model_validate(
        {key: context[key] for key in TutorContext.model_fields if key in context}
    )

    runtime = resources(snapshot)
    index = 0

    def active():
        return control.active(execution_id, lease)

    search = live_search(runtime, control, execution_id, lease)

    def progress(text, tokens):
        nonlocal index
        index += 1

        publish(Result(execution_id, lease, index, "running", text, tokens))

    store = runtime.checkpoints
    resume = resume_state(store, control, execution_id, lease, snapshot)
    save = checkpoint_saver(store, execution_id, lease, snapshot)

    with runtime.trace.execution(execution_id, snapshot.sessionId) as span:
        result = run_tutor(
            snapshot,
            context["prompt"],
            context["mode"],
            context.get("effort", "low"),
            context["solutionAllowed"],
            budget,
            runtime.model,
            active,
            progress,
            runtime.trace.tool,
            search,
            clock=runtime.clock,
            summarizer=runtime.summarizer,
            resume=resume,
            save=save,
        )
        sources = result["grounding"]

        span.record_metadata(
            {
                "calls": result["calls"],
                "tokens": result["tokens"],
                "unavailable": result["unavailable"],
                **grounding_measurements(sources),
                **memory_measurements(snapshot, result),
            }
        )

        if result["unavailable"]:
            # A terminal failure, not a turn: Core keeps it out of the conversation history.
            publish(Result(execution_id, lease, 100, "failed", result["text"], result["tokens"]))
        else:
            publish(
                Result(
                    execution_id,
                    lease,
                    100,
                    "completed",
                    result["text"],
                    result["tokens"],
                    grounding=sources,
                    memory=memory_outcome(result),
                )
            )

    forget(store, execution_id)
