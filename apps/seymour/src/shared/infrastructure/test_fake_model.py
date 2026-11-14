import time
from contextlib import contextmanager
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.evaluation.application.evaluator import evaluation_task, run_analysis
from src.evaluation.domain.evaluation import AnalysisContext
from src.roadmap.application.generator import GENERATION_BUDGET, roadmap_task, run_generation
from src.roadmap.domain.roadmap import GenerationContext
from src.shared.domain.inference import (
    BudgetExceeded,
    Message,
    ModelTask,
    ModelUnavailable,
    TutorCancelled,
)
from src.shared.domain.prompts import PromptFamily
from src.shared.infrastructure.fake_model import DEMO_NOTE, FakeModel
from src.tutor.application.guidance import guidance_task
from src.tutor.application.summary import summarize, summary_task
from src.tutor.application.tutor import run_tutor
from src.tutor.domain.context import TutorContext

pytestmark = pytest.mark.unit

STARTER = "// TODO: Model reservation rules.\n"
SOLVED = "export class InvalidReservation extends Error {}\n"


class Generations:
    def __init__(self):
        self.calls = []
        self.usages = []

    @contextmanager
    def __call__(self, call):
        self.calls.append(call)
        record = MagicMock()
        record.usage.side_effect = self.usages.append

        yield record


def tutor_context(**overrides):
    values = {
        "sessionId": "session-a",
        "stepId": "model-reservation",
        "objective": "Learn hexagonal architecture",
        "stepTitle": "Keep the rule inside the domain",
        "files": {"src/domain/reservation.ts": STARTER},
        "challenge": {
            "instructions": "Implement src/domain/reservation.ts.",
            "criteria": [
                {"id": "domain-validation", "description": "Rejects empty workshops"},
                {"id": "framework-free", "description": "Imports no NestJS modules"},
            ],
        },
        "activeFile": "src/domain/reservation.ts",
    }

    return TutorContext(**{**values, **overrides})


def analysis_context(files):
    return AnalysisContext(
        sessionId="session-a",
        attemptId=str(uuid4()),
        revision=2,
        stepId="model-reservation",
        objective="Learn hexagonal architecture",
        stepTitle="Keep the rule inside the domain",
        files=files,
        challenge={
            "instructions": "Implement src/domain/reservation.ts and src/domain/errors.ts.",
            "criteria": [
                {
                    "id": "domain-validation",
                    "description": "src/domain/reservation.ts rejects empty workshops.",
                },
                {"id": "named-error", "description": "A named rule error exists."},
            ],
        },
        syntax={"coverage": "complete", "checked": [], "unchecked": []},
    )


def ask_tutor(model, prompt="How do I start?"):
    return run_tutor(
        tutor_context(),
        prompt,
        "doubt",
        "low",
        False,
        8000,
        model,
        lambda: True,
        MagicMock(),
        lambda _name, action: action(),
        clock=time.monotonic,
    )


def analyze(files):
    model = FakeModel(evaluation_task(), Generations())

    return run_analysis(
        analysis_context(files),
        "low",
        8000,
        model,
        lambda: True,
        MagicMock(),
        clock=time.monotonic,
    )


def test_tutor_reads_the_criteria_with_a_tool_before_answering():
    generations = Generations()
    model = FakeModel(guidance_task(), generations)

    result = ask_tutor(model)

    tool_calls = [call for message in result["messages"] for call in message.tool_calls]
    assert [call["name"] for call in tool_calls] == ["read_criteria"]
    assert result["failure"] is None
    assert result["text"].startswith(DEMO_NOTE)
    assert "How do I start?" in result["text"]
    assert "2 acceptance criteria" in result["text"]
    assert "Next step: Open src/domain/reservation.ts" in result["text"]
    assert len(generations.calls) == 2
    assert result["tokens"] == sum(usage.input + usage.output for usage in generations.usages)


def test_tutor_answers_are_deterministic():
    first = ask_tutor(FakeModel(guidance_task(), Generations()))
    second = ask_tutor(FakeModel(guidance_task(), Generations()))

    assert first["text"] == second["text"]
    assert first["tokens"] == second["tokens"]


def test_starter_code_leaves_criteria_unmet_and_points_at_the_marker():
    result = analyze({"src/domain/reservation.ts": SOLVED + STARTER})

    evaluation = result["evaluation"]
    assert result["reason"] == "evaluated"
    assert [criterion.status for criterion in evaluation.criteria] == ["not_met", "not_met"]
    assert evaluation.findings[0].path == "src/domain/reservation.ts"
    assert evaluation.findings[0].line == 2


def test_criteria_are_met_once_the_files_they_name_lose_the_marker():
    files = {"src/domain/reservation.ts": SOLVED, "src/domain/errors.ts": STARTER}

    result = analyze(files)

    statuses = {criterion.id: criterion.status for criterion in result["evaluation"].criteria}
    assert statuses == {"domain-validation": "met", "named-error": "not_met"}


def test_criteria_without_named_files_fall_back_to_the_step_files():
    files = {"src/domain/reservation.ts": SOLVED, "src/domain/errors.ts": SOLVED}

    result = analyze(files)

    statuses = [criterion.status for criterion in result["evaluation"].criteria]
    assert statuses == ["met", "met"]
    assert result["evaluation"].findings == []


def test_generated_roadmap_passes_the_roadmap_rules():
    snapshot = GenerationContext(
        sessionId="session-a",
        workspaceId=str(uuid4()),
        goal="Learn hexagonal architecture with NestJS",
        level="beginner",
        sources=[],
    )
    model = FakeModel(roadmap_task(), Generations())

    result = run_generation(
        snapshot,
        "low",
        GENERATION_BUDGET,
        model,
        lambda: True,
        MagicMock(),
        clock=time.monotonic,
    )

    assert result["reason"] == "generated"
    assert result["calls"] == 1
    definition = result["roadmap"]["definition"]
    assert definition["title"] == "Demo: Learn hexagonal architecture with NestJS"
    assert [step["requires"] for step in definition["steps"]] == [
        [],
        ["understand-the-goal"],
        ["build-the-core"],
    ]


def test_summary_folds_the_learner_turns_without_the_fallback():
    snapshot = tutor_context(
        summary={"covered": ["ports"], "pending": ["add a test"], "struggles": [], "stepId": "x"},
        foldTurns=[{"prompt": "What is a port?", "answer": "A contract."}],
    )
    model = FakeModel(summary_task(), Generations())

    content, tokens, fallback = summarize(
        snapshot, model, 8000, time.monotonic() + 10, lambda: True, time.monotonic
    )

    assert fallback is False
    assert tokens > 0
    assert content.covered == ["ports", "Asked: What is a port?"]
    assert content.pending == ["add a test"]


def complete(model, remaining=8000, deadline=None, active=lambda: True):
    messages = [Message(role="user", content='{"request": "Hi"}')]

    return model.complete(messages, [], "low", remaining, deadline or time.monotonic() + 10, active)


def test_a_reservation_that_does_not_fit_the_budget_is_refused():
    model = FakeModel(guidance_task(), Generations())

    with pytest.raises(BudgetExceeded):
        complete(model, remaining=500)


def test_cancellation_and_the_deadline_are_checked_before_answering():
    model = FakeModel(guidance_task(), Generations())

    with pytest.raises(TutorCancelled):
        complete(model, active=lambda: False)

    with pytest.raises(ModelUnavailable) as failure:
        complete(model, deadline=time.monotonic() - 1)

    assert failure.value.reason == "timeout"


def test_an_unknown_task_is_rejected():
    task = ModelTask("unknown_task", {}, PromptFamily("unknown", {"system": "x"}))
    model = FakeModel(task, Generations())

    with pytest.raises(ValueError):
        complete(model)
