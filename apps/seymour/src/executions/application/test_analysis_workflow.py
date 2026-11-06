import json
import time
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.evaluation.domain.evaluation import AnalysisContext
from src.executions.application.resources import ExecutionResources
from src.executions.infrastructure.composition import run_job
from src.shared.domain.inference import Message

pytestmark = pytest.mark.unit

ATTEMPT_ID = str(uuid4())


@pytest.fixture
def context():
    return AnalysisContext(
        sessionId="session-a",
        attemptId=ATTEMPT_ID,
        revision=4,
        stepId="separate-rules",
        objective="Learn HTTP",
        stepTitle="Separate business rules",
        files={
            "src/greeting.ts": 'import { Response } from "express";\nexport const greet = (n: string) => n;\n',
            "src/http.ts": 'import { greet } from "./greeting";\n',
            "docs/": "",
        },
        challenge={
            "instructions": "Extract greeting construction into a pure function.",
            "criteria": [
                {"id": "pure-function", "description": "No HTTP dependencies"},
                {"id": "boundary-validation", "description": "Validate at the boundary"},
            ],
        },
        syntax={
            "coverage": "complete",
            "checked": [{"path": "src/greeting.ts", "language": "typescript"}],
            "unchecked": [],
        },
    )


def answer(criteria=None, path="src/greeting.ts", tokens=900):
    payload = {
        "summary": "The domain module imports the HTTP framework.",
        "criteria": criteria
        or [
            {
                "id": "pure-function",
                "status": "not_met",
                "feedback": "greeting.ts imports express.",
            },
            {"id": "boundary-validation", "status": "met", "feedback": "http.ts validates input."},
        ],
        "findings": [
            {
                "category": "structure",
                "severity": "error",
                "path": path,
                "message": "Domain code depends on the HTTP layer.",
            }
        ],
        "hints": ["Which module should know about HTTP?", "Look at the imports of greeting.ts."],
    }

    return Message(
        role="assistant",
        content=json.dumps(payload),
        usage={"input_tokens": tokens - 100, "output_tokens": 100, "total_tokens": tokens},
    )


def test_worker_publishes_bound_evaluation_through_the_results_contract(
    context, monkeypatch, noop_trace
):
    execution_id = str(uuid4())
    lease = str(uuid4())
    events = []
    snapshot = {"kind": "analysis", "effort": "high", **context.model_dump()}

    model = MagicMock()
    model.complete.return_value = answer()
    runtime = ExecutionResources(model, noop_trace, time.monotonic)
    monkeypatch.setattr(
        "src.executions.infrastructure.composition.evaluation_resources", lambda: runtime
    )

    def control(request):
        if request["action"] == "claim":
            return {"status": "running", "lease": lease, "input": snapshot, "budget": 8000}

        return {"active": True}

    run_job({"version": 1, "executionId": execution_id}, control, events.append)

    assert model.complete.call_args.args[2:4] == ("high", 8000)
    assert [event["status"] for event in events] == ["running", "completed"]
    final = events[-1]
    assert final["index"] == 100
    assert final["tokens"] == 900
    assert final["evaluation"]["attemptId"] == ATTEMPT_ID
    assert "1 of 2 criteria met" in final["text"]
    assert "approved" not in final["text"].lower()


def test_analysis_with_every_provider_down_fails_through_the_results_contract(
    context, monkeypatch, noop_trace
):
    from src.shared.domain.inference import ModelUnavailable

    lease = str(uuid4())
    events = []
    snapshot = {"kind": "analysis", "effort": "medium", **context.model_dump()}

    model = MagicMock()
    model.complete.side_effect = ModelUnavailable("rate_limited")
    runtime = ExecutionResources(model, noop_trace, time.monotonic)
    monkeypatch.setattr(
        "src.executions.infrastructure.composition.evaluation_resources", lambda: runtime
    )

    def control(request):
        if request["action"] == "claim":
            return {"status": "running", "lease": lease, "input": snapshot, "budget": 8000}

        return {"active": True}

    run_job({"version": 1, "executionId": str(uuid4())}, control, events.append)

    final = events[-1]

    assert final["status"] == "failed"
    assert final["tokens"] == 0
    assert "evaluation" not in final or final["evaluation"] is None
    assert "progress did not change" in final["text"]
