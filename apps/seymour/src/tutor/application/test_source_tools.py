import pytest

from src.tutor.application.tools import call_tool, tool_definitions
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


class RecordingSearch:
    def __init__(self, passages):
        self.passages = passages
        self.calls = []

    def __call__(self, query, document_ids):
        self.calls.append((query, document_ids))

        return self.passages, 7


def test_search_is_offered_only_when_sources_are_authorized():
    with_sources = {tool["name"] for tool in tool_definitions(build())}
    without = {tool["name"] for tool in tool_definitions(build(sources=[], sourceIds=[]))}

    assert "search_sources" in with_sources
    assert "search_sources" not in without


def test_search_returns_cited_excerpts_from_authorized_documents():
    passages = [
        {
            "documentId": PDF,
            "content": "POST /v1/orders accepts JSON.",
            "location": {"page": 3},
            "distance": 0.3,
        },
        {"documentId": FOREIGN, "content": "leaked", "location": {"page": 1}, "distance": 0.1},
    ]
    search = RecordingSearch(passages)
    arguments = {"stepId": "validate-input", "query": "order payload"}

    result = call_tool(build(), "search_sources", arguments, search)

    assert result.kind == "sources"
    assert result.data["excerpts"] == [
        {
            "sourceId": PDF,
            "cite": "Usadosbr API.pdf, p. 3",
            "location": {"page": 3},
            "start": 0,
            "text": "POST /v1/orders accepts JSON.",
        }
    ]
    assert search.calls == [("order payload", [PDF, NOTES])]


def test_search_rejects_unauthorized_sources_and_missing_capability():
    search = RecordingSearch([])
    foreign = {"stepId": "validate-input", "query": "x", "sourceIds": [FOREIGN]}
    plain = {"stepId": "validate-input", "query": "x"}

    unauthorized = call_tool(build(), "search_sources", foreign, search)
    unavailable = call_tool(build(sources=[], sourceIds=[]), "search_sources", plain, search)

    assert unauthorized.data == {"message": "Source is not authorized"}
    assert unavailable.data == {"message": "No sources are available"}
    assert search.calls == []
