import pytest
from pydantic import ValidationError

from src.tutor.domain.context import TutorContext

pytestmark = pytest.mark.unit


@pytest.fixture
def context():
    return TutorContext(
        sessionId="session-a",
        stepId="validate-input",
        objective="Build an HTTP service",
        stepTitle="Validate input",
        files={"src/": "", "src/main.ts": "const name = input.name;", "secret.ts": "private code"},
        challenge={
            "instructions": "Validate the name",
            "criteria": [{"id": "name", "description": "Reject empty input"}],
        },
        activeFile="src/main.ts",
        selection={"start": 0, "end": 5},
    )


def test_working_context_loads_only_selection_and_tree(context):
    working = context.working_context(2000)

    assert working["selectedCode"] == "const"
    assert working["activeFile"] == "src/main.ts"
    assert working["tree"] == ["src/", "src/main.ts", "secret.ts"]
    assert "private code" not in str(working)
    assert "input.name" not in str(working)

    with pytest.raises(ValueError, match="allowance"):
        context.working_context(10)


@pytest.mark.parametrize(
    "changes",
    [
        {"activeFile": "other.ts"},
        {"activeFile": "src/"},
        {"activeFile": None},
        {"selection": {"start": 5, "end": 2}},
        {"selection": {"start": 0, "end": 999}},
        {"files": {"../.env": "secret"}},
        {"files": {"src/": "code"}},
        {"files": {"src/main.ts": "x" * 16001}},
        {"files": {f"file-{index}": "" for index in range(21)}},
        {"files": {f"file-{index}": "x" * 16000 for index in range(4)}},
    ],
)
def test_context_rejects_invalid_saved_file_and_selection(context, changes):
    payload = {**context.model_dump(), **changes}

    with pytest.raises(ValidationError):
        TutorContext.model_validate(payload)


def test_context_summarizes_large_workspaces_and_utf16_selections(context):
    payload = {
        **context.model_dump(),
        "objective": "Learn validation " * 400,
        "stepTitle": "A long step title " * 400,
        "files": {
            "main.ts": "😀" + "x" * 1000,
            **{f"file-{index}.ts": "not loaded" for index in range(10)},
        },
        "activeFile": "main.ts",
        "selection": {"start": 0, "end": 502},
    }
    snapshot = TutorContext.model_validate(payload)

    working = snapshot.working_context(4000)

    assert len(working["objective"]) == 128
    assert len(working["tree"]) == 5
    assert working["treeTruncated"] is True
    assert working["selectionTruncated"] is True
    assert working["selectedCode"].startswith("😀x")
    assert len(working["selectedCode"]) == 256
