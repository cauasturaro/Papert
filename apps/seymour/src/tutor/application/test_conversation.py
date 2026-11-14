import pytest

from src.tutor.application.conversation import search_query
from src.tutor.domain.context import TutorContext

pytestmark = pytest.mark.unit

PDF = "11111111-1111-4111-8111-111111111111"


NOTES = "22222222-2222-4222-8222-222222222222"


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


def test_short_follow_ups_are_searched_with_the_previous_question():
    turns = [{"prompt": "Is there a request example in @Usadosbr API.pdf?", "answer": "Yes."}]
    context = build(recentTurns=turns)

    follow_up = search_query(context, "Can you show me that example?")
    standalone = search_query(build(), "Can you show me that example?")
    long_question = search_query(context, "x" * 200)

    assert (
        follow_up
        == "Is there a request example in @Usadosbr API.pdf?\nCan you show me that example?"
    )
    assert standalone == "Can you show me that example?"
    assert long_question == "x" * 200
