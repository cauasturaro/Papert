import json
from unittest.mock import MagicMock

import pytest

from src.executions.application.resources import ExecutionResources
from src.executions.application.workflows import run_tutor_job
from src.shared.domain.inference import Message
from src.tutor.domain.context import TutorContext

pytestmark = pytest.mark.unit


@pytest.fixture
def context():
    return TutorContext(
        sessionId="session-a",
        stepId="validate-input",
        objective="Learn HTTP",
        stepTitle="Validate input",
        files={"main.ts": "const input = {};"},
        challenge={
            "instructions": "Validate input",
            "criteria": [{"id": "name", "description": "Reject an empty name"}],
        },
        activeFile="main.ts",
    )


def response(content=None, calls=None):
    return Message(
        role="assistant",
        content=content
        or json.dumps(
            {
                "explanation": "Validate at the HTTP boundary.",
                "next_step": "Check the type of name.",
                "question": "What should happen for an empty string?",
            }
        ),
        tool_calls=calls or [],
        usage={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
    )


def test_tutor_workflow_accepts_provider_free_resources(context, noop_trace):
    model = MagicMock()
    model.complete.return_value = response()
    runtime = ExecutionResources(model, noop_trace, lambda: 100.0)
    control = MagicMock()
    control.active.return_value = True
    published = []
    request = {
        **context.model_dump(),
        "prompt": "Help with validation",
        "mode": "doubt",
        "solutionAllowed": False,
    }

    run_tutor_job("execution", "lease", request, 8000, control, published.append, lambda _: runtime)

    assert published[-1].status == "completed"
    assert published[-1].tokens == 150
    assert "HTTP boundary" in published[-1].text
