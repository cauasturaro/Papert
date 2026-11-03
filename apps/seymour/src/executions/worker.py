"""Execution worker. Legacy jobs keep their deterministic transport behavior."""

import time
from collections.abc import Callable
from typing import Any
from uuid import UUID


def run_job(
    message: dict,
    control: Callable[[dict], dict],
    publish: Callable[[dict], Any],
    pause: Callable[[float], Any] = time.sleep,
) -> None:
    if set(message) != {"version", "executionId"} or message["version"] != 1:
        raise ValueError("Unsupported execution envelope")

    execution_id = str(UUID(message["executionId"]))
    claim = control({"action": "claim", "executionId": execution_id})
    status = claim["status"]
    if status in {"completed", "cancelled", "timed_out"}:
        return
    if status != "running":
        raise RuntimeError("Execution is busy or permanently failed")

    lease = claim["lease"]
    context = claim["input"]
    tutor = "mode" in context
    analysis = context.get("kind") == "analysis" and "attemptId" in context
    expected_budget = 8000 if tutor or analysis else 1000
    if claim["budget"] != expected_budget or context["kind"] not in {"chat", "analysis"}:
        raise ValueError("Invalid authorized execution context")

    if analysis:
        try:
            run_analysis_job(execution_id, lease, context, claim["budget"], control, publish)
        except Exception:
            control({"action": "failed", "executionId": execution_id, "lease": lease})
            raise

        return

    if tutor:
        try:
            run_tutor_job(execution_id, lease, context, claim["budget"], control, publish)
        except Exception:
            control({"action": "failed", "executionId": execution_id, "lease": lease})
            raise

        return

    chunks = [
        "Your saved workspace was received. ",
        "Compare the code with the current challenge criteria. ",
        "This deterministic transport check does not evaluate or approve your solution.",
    ]
    text = ""

    try:
        for index, chunk in enumerate(chunks, start=1):
            active = control({"action": "active", "executionId": execution_id, "lease": lease})
            if not active["active"]:
                publish(
                    {
                        "version": 1,
                        "executionId": execution_id,
                        "lease": lease,
                        "index": 100,
                        "status": "completed",
                        "text": "",
                        "tokens": 0,
                    }
                )

                return

            text += chunk
            final = index == len(chunks)
            publish(
                {
                    "version": 1,
                    "executionId": execution_id,
                    "lease": lease,
                    "index": index,
                    "status": "completed" if final else "running",
                    "text": text,
                    "tokens": 0,
                }
            )

            if not final:
                pause(1)
    except Exception:
        control({"action": "failed", "executionId": execution_id, "lease": lease})
        raise


def run_tutor_job(execution_id, lease, context, budget, control, publish):
    import os

    from src.tutor.application.tutor import run_tutor
    from src.tutor.domain.context import TutorContext
    from src.tutor.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
    from src.tutor.infrastructure.tracing import TutorTrace

    snapshot = TutorContext.model_validate(
        {key: context[key] for key in TutorContext.model_fields if key in context}
    )
    trace = TutorTrace()
    search = None

    if snapshot.sources:
        from src.retrieval.application.grounding import SEARCH_LIMIT
        from src.retrieval.application.search import SourceSearch
        from src.retrieval.infrastructure.openai_embedder import OpenAIQueryEmbedder
        from src.retrieval.infrastructure.pgvector_index import PgvectorPassageIndex

        searcher = SourceSearch(
            snapshot.workspaceId,
            [source.id for source in snapshot.sources],
            OpenAIQueryEmbedder(),
            PgvectorPassageIndex(),
        )

        def search(query, document_ids):
            return searcher.search(query, document_ids, SEARCH_LIMIT)

    model = OpenAIModel(
        os.environ["OPENAI_API_KEY"],
        os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        trace.generation,
    )
    index = 0

    def active():
        state = control({"action": "active", "executionId": execution_id, "lease": lease})

        return state["active"]

    def progress(text, tokens):
        nonlocal index
        index += 1
        publish(
            {
                "version": 1,
                "executionId": execution_id,
                "lease": lease,
                "index": index,
                "status": "running",
                "text": text,
                "tokens": tokens,
            }
        )

    with trace.execution(execution_id, snapshot.sessionId) as span:
        result = run_tutor(
            snapshot,
            context["prompt"],
            context["mode"],
            context.get("effort", "low"),
            context["solutionAllowed"],
            budget,
            model,
            active,
            progress,
            trace.tool,
            search,
        )
        span.update(metadata={"calls": result["calls"], "tokens": result["tokens"]})

        publish(
            {
                "version": 1,
                "executionId": execution_id,
                "lease": lease,
                "index": 100,
                "status": "completed",
                "text": result["text"],
                "tokens": result["tokens"],
            }
        )


ANALYSIS_MESSAGES = {
    "budget": "The saved files exceed this analysis budget. Reduce the workspace and analyze again.",
    "invalid": "Seymour could not produce a valid evaluation. Your progress did not change; analyze again.",
    "deadline": "The analysis time limit was reached. Your progress did not change; analyze again.",
    "cancelled": "",
}


def run_analysis_job(execution_id, lease, context, budget, control, publish):
    import os

    from src.evaluation.application.evaluator import run_analysis, summary_text
    from src.evaluation.domain.evaluation import AnalysisContext, ModelEvaluation
    from src.tutor.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
    from src.tutor.infrastructure.tracing import TutorTrace

    snapshot = AnalysisContext.model_validate(
        {key: context[key] for key in AnalysisContext.model_fields if key in context}
    )
    trace = TutorTrace()
    model = OpenAIModel(
        os.environ["OPENAI_API_KEY"],
        os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        trace.generation,
        "attempt_evaluation",
        ModelEvaluation.model_json_schema(),
    )
    index = 0

    def active():
        state = control({"action": "active", "executionId": execution_id, "lease": lease})

        return state["active"]

    def progress(text, tokens):
        nonlocal index
        index += 1
        publish(
            {
                "version": 1,
                "executionId": execution_id,
                "lease": lease,
                "index": index,
                "status": "running",
                "text": text,
                "tokens": tokens,
            }
        )

    with trace.execution(execution_id, snapshot.sessionId, "seymour-evaluation") as span:
        result = run_analysis(
            snapshot,
            context.get("effort", "medium"),
            budget,
            model,
            active,
            progress,
        )
        span.update(
            metadata={
                "calls": result["calls"],
                "tokens": result["tokens"],
                "reason": result["reason"],
            }
        )

        event = {
            "version": 1,
            "executionId": execution_id,
            "lease": lease,
            "index": 100,
            "status": "completed",
            "text": ANALYSIS_MESSAGES.get(result["reason"], ""),
            "tokens": result["tokens"],
        }
        if result["evaluation"] is not None:
            event["text"] = summary_text(result["evaluation"])
            event["evaluation"] = result["evaluation"].model_dump()

        publish(event)
