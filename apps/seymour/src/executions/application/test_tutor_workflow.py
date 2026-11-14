import itertools
import json
from unittest.mock import MagicMock

import pytest

from src.executions.application.resources import ExecutionResources
from src.executions.application.tutor_workflow import run_tutor_job
from src.shared.domain.inference import Message
from src.tutor.application.tutor import DEADLINE_SECONDS
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


def test_tutor_workflow_publishes_its_memory_outcome_and_forgets_the_checkpoint(
    context, noop_trace
):
    model = MagicMock()
    model.complete.return_value = response(
        json.dumps(
            {
                "explanation": "Validate at the HTTP boundary.",
                "next_step": "Check the type of name.",
                "question": "What should happen for an empty string?",
                "remember_kind": "preference",
                "remember_text": "Prefers short answers",
            }
        )
    )
    store = MagicMock()
    store.load.return_value = None
    runtime = ExecutionResources(model, noop_trace, lambda: 100.0, checkpoints=store)
    control = MagicMock()
    control.active.return_value = True
    published = []
    request = {
        **context.model_dump(),
        "prompt": "Keep answers short from now on, please.",
        "mode": "doubt",
        "solutionAllowed": False,
    }

    run_tutor_job("execution", "lease", request, 8000, control, published.append, lambda _: runtime)

    final = published[-1]
    assert final.status == "completed"
    assert final.memory == {"proposal": {"kind": "preference", "text": "Prefers short answers"}}
    store.load.assert_called_once_with("execution")
    store.delete.assert_called_once_with("execution")


def test_total_model_failure_ends_the_execution_as_failed_not_as_a_turn(context, noop_trace):
    from src.shared.domain.inference import ModelUnavailable

    model = MagicMock()
    model.complete.side_effect = ModelUnavailable("timeout", charged=2148)
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

    final = published[-1]

    assert final.status == "failed"
    assert final.tokens == 2148
    assert "can't reach" in final.text
    assert final.grounding is None
    assert final.memory is None


def test_a_limit_outcome_ends_as_failed_so_it_never_becomes_a_turn(context, noop_trace):
    model = MagicMock()
    # Every reading is one full deadline later, so it passes before the first call.
    moments = itertools.count(100.0, DEADLINE_SECONDS)
    runtime = ExecutionResources(model, noop_trace, lambda: next(moments))
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

    final = published[-1]

    assert final.status == "failed"
    assert "ran out of time" in final.text
    assert final.grounding is None
    assert final.memory is None
    model.complete.assert_not_called()
