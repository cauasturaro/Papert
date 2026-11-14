from uuid import uuid4

import pytest

from src.evaluation.domain.evaluation import AnalysisContext

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


def test_rejects_snapshots_outside_the_authorized_workspace(context):
    data = context.model_dump()

    with pytest.raises(ValueError):
        AnalysisContext.model_validate({**data, "files": {"../.env": "SECRET=1"}})


@pytest.mark.parametrize(
    "checked",
    [
        {"language": "typescript"},
        {"path": "main.ts"},
        {"path": "main.ts", "language": "typescript", "extra": True},
    ],
)
def test_checked_syntax_files_require_the_core_wire_fields(context, checked):
    data = context.model_dump()
    data["syntax"]["checked"] = [checked]

    with pytest.raises(ValueError):
        AnalysisContext.model_validate(data)
