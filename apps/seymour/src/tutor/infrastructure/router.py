"""Internal IAM-only invocation of the same leased execution worker used by SQS."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from worker_handler import handler

router = APIRouter()


class ExecutionEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1]
    executionId: UUID


@router.post("/internal/seymour/executions")
def execute(body: ExecutionEnvelope, request: Request):
    event = request.scope.get("aws.event", {})
    identity = event.get("requestContext", {}).get("authorizer", {}).get("iam", {})
    if not identity.get("userArn"):
        raise HTTPException(
            status_code=403, detail="An IAM-authenticated Gateway invocation is required"
        )

    result = handler(
        {"Records": [{"messageId": str(body.executionId), "body": body.model_dump_json()}]}, None
    )
    if result["batchItemFailures"]:
        raise HTTPException(
            status_code=503, detail="Execution could not complete; retry its existing ID"
        )

    return {"executionId": str(body.executionId)}
