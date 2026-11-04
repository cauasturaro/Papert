"""Seymour transport DTOs shared by HTTP, SQS and the local runner."""

from functools import cache
from typing import Literal
from uuid import UUID

from src.executions.domain.execution import Execution, Result


@cache
def execution_envelope_model():
    # Only the HTTP adapter needs Pydantic; keep queue-only cold starts lightweight.
    from pydantic import BaseModel, ConfigDict

    class ExecutionEnvelope(BaseModel):
        model_config = ConfigDict(extra="forbid")

        version: Literal[1]
        executionId: UUID

    return ExecutionEnvelope


def decode_execution(message: dict) -> Execution:
    # Preserve the worker's existing strict key/version check and UUID normalization.
    if set(message) != {"version", "executionId"} or message["version"] != 1:
        raise ValueError("Unsupported execution envelope")

    return Execution(str(UUID(message["executionId"])))


def encode_result(result: Result) -> dict:
    event = {
        "version": 1,
        "executionId": result.execution_id,
        "lease": result.lease,
        "index": result.index,
        "status": result.status,
        "text": result.text,
        "tokens": result.tokens,
    }
    if result.evaluation is not None:
        event["evaluation"] = result.evaluation

    if result.grounding is not None:
        event["grounding"] = result.grounding

    if result.roadmap is not None:
        event["roadmap"] = result.roadmap

    return event
