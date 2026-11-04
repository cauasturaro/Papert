"""Lazy per-execution adapter composition shared by Lambda and local entry points."""

from __future__ import annotations

import os
import time
from functools import partial
from typing import TYPE_CHECKING

from src.executions.application.contracts.transport import decode_execution, encode_result
from src.executions.application.worker import run_execution
from src.executions.domain.ports import ExecutionResources
from src.executions.infrastructure.rpc_control import RpcControl

if TYPE_CHECKING:
    from src.roadmap.domain.roadmap import GenerationContext
    from src.tutor.domain.context import TutorContext


def tutor_resources(snapshot: TutorContext) -> ExecutionResources:
    # Inference/retrieval SDK imports stay lazy so transport-only jobs avoid their cold start.
    from src.shared.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
    from src.shared.infrastructure.tracing import ExecutionTrace
    from src.tutor.application.guidance import guidance_schema
    from src.tutor.application.tools import TOOL_ARGUMENTS

    trace = ExecutionTrace(TOOL_ARGUMENTS)
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
        "tutor_guidance",
        guidance_schema(),
    )

    return ExecutionResources(model, trace, time.monotonic, search)


def evaluation_resources() -> ExecutionResources:
    # Evaluation SDKs and schemas are unnecessary for deterministic transport jobs.
    from src.evaluation.domain.evaluation import ModelEvaluation
    from src.shared.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
    from src.shared.infrastructure.tracing import ExecutionTrace

    trace = ExecutionTrace()
    model = OpenAIModel(
        os.environ["OPENAI_API_KEY"],
        os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        trace.generation,
        "attempt_evaluation",
        ModelEvaluation.model_json_schema(),
    )

    return ExecutionResources(model, trace, time.monotonic)


# A five-step roadmap is about 3,000-4,000 output tokens plus reasoning.
GENERATION_OUTPUT_LIMITS = {"low": 7000, "medium": 9000, "high": 10000}
GENERATION_SEARCH_LIMIT = 10


def generation_resources(snapshot: GenerationContext) -> ExecutionResources:
    from src.roadmap.domain.roadmap import ModelRoadmap
    from src.shared.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
    from src.shared.infrastructure.tracing import ExecutionTrace

    trace = ExecutionTrace()
    search = None

    if snapshot.sources:
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
            return searcher.search(query, document_ids, GENERATION_SEARCH_LIMIT)

    model = OpenAIModel(
        os.environ["OPENAI_API_KEY"],
        os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        trace.generation,
        "roadmap_draft",
        ModelRoadmap.model_json_schema(),
        GENERATION_OUTPUT_LIMITS,
    )

    return ExecutionResources(model, trace, time.monotonic, search)


def run_job(message, control, publish, pause=time.sleep):
    # Keep graph/Pydantic imports out of the deterministic worker's cold-start path.
    from src.executions.application.workflows import (
        run_analysis_job,
        run_generation_job,
        run_tutor_job,
    )

    execution = decode_execution(message)
    controller = RpcControl(control)

    def emit(result):
        publish(encode_result(result))

    run_execution(
        execution,
        controller,
        emit,
        partial(run_tutor_job, resources=tutor_resources),
        partial(run_analysis_job, resources=evaluation_resources),
        partial(run_generation_job, resources=generation_resources),
        pause,
    )
