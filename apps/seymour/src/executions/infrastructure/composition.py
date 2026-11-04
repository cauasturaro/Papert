"""Lazy per-execution adapter composition shared by Lambda and local entry points."""

from __future__ import annotations

import os
import time
from functools import partial
from typing import TYPE_CHECKING

from src.executions.application.ports import ExecutionResources
from src.executions.application.worker import run_execution
from src.executions.infrastructure.contracts import RpcControl, decode_execution, encode_result

if TYPE_CHECKING:
    from src.tutor.domain.context import TutorContext


def tutor_resources(snapshot: TutorContext) -> ExecutionResources:
    # Inference/retrieval SDK imports stay lazy so transport-only jobs avoid their cold start.
    from src.tutor.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
    from src.tutor.infrastructure.tracing import TutorTrace

    trace = TutorTrace()
    search = None

    if snapshot.sources:
        from src.retrieval import SEARCH_LIMIT
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

    return ExecutionResources(model, trace, time.monotonic, search)


def evaluation_resources() -> ExecutionResources:
    # Evaluation SDKs and schemas are unnecessary for deterministic transport jobs.
    from src.evaluation.domain.evaluation import ModelEvaluation
    from src.tutor.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
    from src.tutor.infrastructure.tracing import TutorTrace

    trace = TutorTrace()
    model = OpenAIModel(
        os.environ["OPENAI_API_KEY"],
        os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        trace.generation,
        "attempt_evaluation",
        ModelEvaluation.model_json_schema(),
    )

    return ExecutionResources(model, trace, time.monotonic)


def run_job(message, control, publish, pause=time.sleep):
    # Keep graph/Pydantic imports out of the deterministic worker's cold-start path.
    from src.executions.application.workflows import run_analysis_job, run_tutor_job

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
        pause,
    )
