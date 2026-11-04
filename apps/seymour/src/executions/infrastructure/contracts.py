"""Seymour transport DTOs shared by HTTP, SQS and the local runner."""

from functools import cache
from typing import Literal
from uuid import UUID

from src.executions.domain.execution import Claim, Execution, Result


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


class RpcControl:
    def __init__(self, invoke):
        self.invoke = invoke

    def claim(self, execution_id: str) -> Claim:
        answer = self.invoke({"action": "claim", "executionId": execution_id})

        status = answer["status"]
        if status != "running":
            return Claim(status)

        return Claim(status, answer["lease"], answer["input"], answer["budget"])

    def active(self, execution_id: str, lease: str) -> bool:
        answer = self.invoke({"action": "active", "executionId": execution_id, "lease": lease})

        return answer["active"]

    def failed(self, execution_id: str, lease: str) -> None:
        self.invoke({"action": "failed", "executionId": execution_id, "lease": lease})

    def live_sources(self, execution_id: str, lease: str) -> list[str]:
        answer = self.invoke({"action": "sources", "executionId": execution_id, "lease": lease})

        return answer["sourceIds"]
