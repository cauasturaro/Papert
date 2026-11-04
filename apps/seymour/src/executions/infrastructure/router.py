"""Internal IAM-only invocation of the same leased execution worker used by SQS."""

from fastapi import APIRouter, HTTPException, Request

from src.executions.infrastructure.contracts import execution_envelope_model
from src.executions.infrastructure.entry import run_single_execution

ExecutionEnvelope = execution_envelope_model()
router = APIRouter()


@router.post("/internal/seymour/executions")
def execute(body: ExecutionEnvelope, request: Request):
    event = request.scope.get("aws.event", {})
    identity = event.get("requestContext", {}).get("authorizer", {}).get("iam", {})
    if not identity.get("userArn"):
        raise HTTPException(
            status_code=403, detail="An IAM-authenticated Gateway invocation is required"
        )

    try:
        run_single_execution(body.model_dump(mode="json"))
    except Exception:
        raise HTTPException(
            status_code=503, detail="Execution could not complete; retry its existing ID"
        ) from None

    return {"executionId": str(body.executionId)}
