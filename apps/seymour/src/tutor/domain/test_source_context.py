import pytest

from src.tutor.domain.context import TutorContext

pytestmark = pytest.mark.unit

PDF = "11111111-1111-4111-8111-111111111111"


NOTES = "22222222-2222-4222-8222-222222222222"


FOREIGN = "33333333-3333-4333-8333-333333333333"


def build(**overrides):
    values = {
        "sessionId": "session-a",
        "stepId": "validate-input",
        "objective": "Build an HTTP service",
        "stepTitle": "Validate input",
        "files": {"src/main.ts": "const name = input.name;"},
        "challenge": {
            "instructions": "Validate the name",
            "criteria": [{"id": "name", "description": "Reject empty input"}],
        },
        "workspaceId": "44444444-4444-4444-8444-444444444444",
        "sources": [
            {"id": PDF, "filename": "Usadosbr API.pdf", "format": "pdf"},
            {"id": NOTES, "filename": "notes.md", "format": "md"},
        ],
        "sourceIds": [NOTES],
    }

    return TutorContext(**{**values, **overrides})


def test_context_rejects_mentions_outside_the_authorized_sources():
    with pytest.raises(ValueError, match="Mentioned sources"):
        build(sourceIds=[FOREIGN])

    with pytest.raises(ValueError, match="authorized workspace"):
        build(workspaceId=None)


def test_working_context_lists_mentioned_sources_first():
    working = build().working_context(4000)

    assert [item["id"] for item in working["sources"]["available"]] == [NOTES, PDF]
    assert working["sources"]["mentioned"] == [NOTES]
