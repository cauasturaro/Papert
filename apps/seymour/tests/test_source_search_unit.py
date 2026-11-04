"""Retrieval orchestration through application-owned ports only."""

import pytest

from src.retrieval.application.search import SourceSearch
from src.retrieval.domain.ports import Passage


def passage(document_id: str, ordinal: int, distance: float | None) -> Passage:
    return {
        "documentId": document_id,
        "ordinal": ordinal,
        "start": ordinal * 100,
        "content": f"chunk {ordinal}",
        "location": {"page": ordinal + 1},
        "distance": distance,
    }


class FakeEmbedder:
    def embed(self, query: str) -> tuple[list[float], int]:
        assert query == "HTTP validation"

        return [0.5], 7


class FakeIndex:
    def __init__(self, results: list[Passage], following: Passage | None):
        self.results = results
        self.next_passage = following
        self.requests = []
        self.following_requests = []

    def nearest(self, workspace_id, document_ids, vector, limit) -> list[Passage]:
        self.requests.append((workspace_id, document_ids, vector, limit))

        return self.results.copy()

    def following(self, workspace_id, best) -> Passage | None:
        self.following_requests.append((workspace_id, best))

        return self.next_passage


@pytest.mark.parametrize(
    ("requested", "authorized"),
    [(["allowed", "foreign"], ["allowed"]), (["allowed", "other"], ["allowed", "other"])],
)
@pytest.mark.parametrize("already_present", [False, True])
def test_authorized_filter_and_following_chunk_selection(requested, authorized, already_present):
    best = passage("allowed", 2, 0.1)
    following = passage("allowed", 3, None)
    other = passage("other", 8, 0.3)
    nearest = [best, other, following] if already_present else [best, other]
    index = FakeIndex(nearest, following)
    search = SourceSearch("workspace", ["allowed", "other"], FakeEmbedder(), index)

    results, tokens = search.search("HTTP validation", requested, 5)

    assert index.requests == [("workspace", authorized, [0.5], 5)]
    assert index.following_requests == [("workspace", best)]
    assert tokens == 7
    assert len(results) == 3

    if already_present:
        assert results == nearest
    else:
        assert results == [best, {**following, "distance": 0.1}, other]


def test_empty_results_do_not_request_a_following_chunk():
    index = FakeIndex([], None)
    search = SourceSearch("workspace", ["allowed"], FakeEmbedder(), index)

    results, tokens = search.search("HTTP validation", ["allowed"], 5)

    assert results == []
    assert tokens == 7
    assert index.following_requests == []


@pytest.mark.parametrize("requested", [[], ["foreign"]])
def test_unauthorized_requests_search_nothing(requested):
    index = FakeIndex([passage("allowed", 1, 0.1)], None)
    embedder = FakeEmbedder()
    search = SourceSearch("workspace", ["allowed"], embedder, index)

    results, tokens = search.search("HTTP validation", requested, 5)

    assert results == []
    assert tokens == 0
    assert index.requests == []
