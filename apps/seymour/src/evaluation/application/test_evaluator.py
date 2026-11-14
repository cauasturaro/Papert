import json
import time
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.evaluation.application.evaluator import DEADLINE_SECONDS, run_analysis, workspace_map
from src.evaluation.domain.evaluation import AnalysisContext
from src.shared.domain.inference import BudgetExceeded, Message, ModelUnavailable

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


def answer(criteria=None, path="src/greeting.ts", tokens=900, **finding_fields):
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
                **finding_fields,
            }
        ],
        "hints": ["Which module should know about HTTP?", "Look at the imports of greeting.ts."],
    }

    return Message(
        role="assistant",
        content=json.dumps(payload),
        usage={"input_tokens": tokens - 100, "output_tokens": 100, "total_tokens": tokens},
    )


def analyze(context, model, **options):
    arguments = dict(
        context=context,
        clock=time.monotonic,
        effort="medium",
        budget=8000,
        model=model,
        active=lambda: True,
        progress=MagicMock(),
    )

    return run_analysis(**{**arguments, **options})


def test_maps_cross_file_imports_for_scripts_and_python():
    files = {
        "src/http.ts": 'import { greet } from "./domain/greeting.js";\nimport express from "express";\n',
        "src/domain/greeting.ts": "export const greet = () => 'hi';\n",
        "app/api.py": "from .rules import greet\nimport fastapi\n",
        "app/rules.py": "def greet(): ...\n",
        "app/main.py": "from app.api import router\n",
        "app/": "",
    }

    entries = {entry["path"]: entry for entry in workspace_map(files)}

    assert entries["src/http.ts"]["imports"] == ["src/domain/greeting.ts"]
    assert entries["src/http.ts"]["externalImports"] == ["express"]
    assert entries["app/api.py"]["imports"] == ["app/rules.py"]
    assert entries["app/api.py"]["externalImports"] == ["fastapi"]
    assert entries["app/main.py"]["imports"] == ["app/api.py"]
    assert "app/" not in entries


def test_binds_attempt_identity_and_sends_all_files_with_the_import_map(context):
    model = MagicMock()
    model.complete.return_value = answer(path="../../etc/passwd")

    result = analyze(context, model)

    evaluation = result["evaluation"]
    assert evaluation.attemptId == ATTEMPT_ID
    assert evaluation.revision == 4
    assert evaluation.stepId == "separate-rules"
    assert evaluation.findings[0].path is None
    assert result["tokens"] == 900
    assert result["calls"] == 1

    messages, tools, effort, remaining, _deadline, _active = model.complete.call_args.args
    payload = json.loads(messages[1].content)
    assert tools == []
    assert effort == "medium"
    assert remaining == 8000
    assert set(payload["files"]) == {"src/greeting.ts", "src/http.ts"}
    assert payload["importMap"][1]["imports"] == ["src/greeting.ts"]
    assert "untrusted" in messages[0].content


def test_repairs_invalid_output_once_with_low_effort_and_counts_both_calls(context):
    model = MagicMock()
    missing = [{"id": "pure-function", "status": "met", "feedback": "Looks fine."}]
    model.complete.side_effect = [answer(criteria=missing), answer(tokens=700)]

    result = analyze(context, model)

    assert result["evaluation"] is not None
    assert result["calls"] == 2
    assert result["tokens"] == 1600
    assert model.complete.call_args_list[1].args[2] == "low"
    assert model.complete.call_args_list[1].args[3] == 8000 - 900
    assert "learner" not in model.complete.call_args_list[1].args[0][-1].content


@pytest.mark.parametrize(
    "content",
    [
        "not json",
        json.dumps({"summary": "ok", "criteria": [], "findings": [], "hints": ["x"]}),
        json.dumps({"verdict": "approved"}),
    ],
)
def test_invalid_output_twice_yields_no_evaluation(context, content):
    model = MagicMock()
    invalid = Message(
        role="assistant",
        content=content,
        usage={"input_tokens": 100, "output_tokens": 10, "total_tokens": 110},
    )
    model.complete.side_effect = [invalid, invalid]

    result = analyze(context, model)

    assert result["evaluation"] is None
    assert result["reason"] == "invalid"
    assert result["tokens"] == 220


def test_budget_and_cancellation_stop_without_an_evaluation(context):
    model = MagicMock()
    model.complete.side_effect = BudgetExceeded()

    over_budget = analyze(context, model)
    cancelled = analyze(context, MagicMock(), active=lambda: False)

    assert over_budget["reason"] == "budget"
    assert over_budget["evaluation"] is None
    assert cancelled["reason"] == "cancelled"
    assert cancelled["calls"] == 0


def test_usage_above_the_admitted_budget_is_an_error(context):
    model = MagicMock()
    model.complete.return_value = answer(tokens=9000)

    with pytest.raises(RuntimeError):
        analyze(context, model)


def test_analysis_deadline_uses_the_injected_clock(context):
    model = MagicMock()
    moments = iter([100.0, 145.0])

    result = analyze(context, model, clock=lambda: next(moments))

    assert result["reason"] == "deadline"
    assert result["calls"] == 0
    assert result["evaluation"] is None
    model.complete.assert_not_called()


def test_a_provider_timeout_at_the_run_deadline_is_the_analysis_time_limit(context):
    model = MagicMock()
    model.complete.side_effect = ModelUnavailable("timeout", charged=1200)
    moments = iter([100.0, 100.0, 100.0 + DEADLINE_SECONDS])

    result = analyze(context, model, clock=lambda: next(moments))

    assert result["reason"] == "deadline"
    assert result["tokens"] == 1200
    assert result["evaluation"] is None


def test_findings_keep_a_line_inside_the_file_and_tolerate_its_absence(context):
    model = MagicMock()
    model.complete.return_value = answer(line=2)

    located = analyze(context, model)["evaluation"].findings[0]

    assert (located.path, located.line) == ("src/greeting.ts", 2)

    model.complete.return_value = answer()

    missing = analyze(context, model)["evaluation"].findings[0]

    assert missing.line is None


def test_findings_drop_a_line_outside_the_file_or_without_a_path(context):
    model = MagicMock()
    model.complete.return_value = answer(line=99)

    beyond = analyze(context, model)["evaluation"].findings[0]

    assert (beyond.path, beyond.line) == ("src/greeting.ts", None)

    model.complete.return_value = answer(path="../../etc/passwd", line=1)

    outside = analyze(context, model)["evaluation"].findings[0]

    assert (outside.path, outside.line) == (None, None)


def test_reports_progress_before_each_model_call(context):
    model = MagicMock()
    missing = [{"id": "pure-function", "status": "met", "feedback": "Looks fine."}]
    model.complete.side_effect = [answer(criteria=missing), answer(tokens=700)]
    progress = MagicMock()

    analyze(context, model, progress=progress)

    messages = [call.args[0] for call in progress.call_args_list]

    assert messages == [
        "Seymour is mapping your files…",
        "Seymour is checking each criterion…",
        "Seymour is double-checking its review…",
    ]
    assert progress.call_args_list[2].args[1] == 900
