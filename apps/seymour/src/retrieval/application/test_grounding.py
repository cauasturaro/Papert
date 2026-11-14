import pytest

from src.retrieval.application.grounding import grounding

pytestmark = pytest.mark.unit

PDF = "11111111-1111-4111-8111-111111111111"


NOTES = "22222222-2222-4222-8222-222222222222"


class RecordingSearch:
    def __init__(self, passages):
        self.passages = passages
        self.calls = []

    def __call__(self, query, document_ids):
        self.calls.append((query, document_ids))

        return self.passages, 7


def passage(document_id, distance, page=1):
    return {
        "documentId": document_id,
        "content": f"text {distance}",
        "location": {"page": page},
        "distance": distance,
    }


def test_grounding_keeps_only_related_passages_unless_a_source_is_mentioned():
    passages = [passage(PDF, 0.3), passage(NOTES, 0.6), passage(PDF, 0.9)]

    filenames = {PDF: "Usadosbr API.pdf", NOTES: "notes.md"}

    automatic = grounding(filenames, [], "payload", RecordingSearch(passages))
    mentioned_search = RecordingSearch([passage(NOTES, 0.95)])
    mentioned = grounding(filenames, [NOTES], "summarize it", mentioned_search)
    without_sources = grounding({}, [], "x", RecordingSearch(passages))

    assert [item["text"] for item in automatic] == ["text 0.3", "text 0.6"]
    assert mentioned_search.calls == [("summarize it", [NOTES])]
    assert [item["sourceId"] for item in mentioned] == [NOTES]
    assert without_sources == []
