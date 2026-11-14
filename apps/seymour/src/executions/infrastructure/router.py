"""Internal IAM-only invocation of the same leased execution worker used by SQS."""

import logging

from fastapi import APIRouter, HTTPException, Request

from src.executions.application.contracts.transport import execution_envelope_model
from src.executions.infrastructure.entry import run_single_execution

ExecutionEnvelope = execution_envelope_model()
router = APIRouter()
log = logging.getLogger(__name__)


# The envelope model is built at runtime to keep Pydantic out of queue-only cold starts.
@router.post("/internal/seymour/executions")
def execute(body: ExecutionEnvelope, request: Request):  # pyright: ignore[reportInvalidTypeForm]
    event = request.scope.get("aws.event", {})
    identity = event.get("requestContext", {}).get("authorizer", {}).get("iam", {})
    if not identity.get("userArn"):
        raise HTTPException(
            status_code=403, detail="An IAM-authenticated Gateway invocation is required"
        )

    execution_id = str(body.executionId)

    try:
        run_single_execution(body.model_dump(mode="json"))
    except Exception as error:
        log.exception("execution_failed", extra={"operation": "http", "executionId": execution_id})

        raise HTTPException(
            status_code=503, detail="Execution could not complete; retry its existing ID"
        ) from error

    return {"executionId": execution_id}
