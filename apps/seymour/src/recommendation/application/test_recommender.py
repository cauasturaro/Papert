import pytest

from src.recommendation.application.recommender import recommend
from src.recommendation.domain.recommendation import (
    RecommendationContext,
    candidate_text,
    content_hash,
)

pytestmark = pytest.mark.unit


class FakeEmbedder:
    model = "fake-embedding"

    def __init__(self, vectors):
        self.vectors = vectors
        self.calls = []

    def count_tokens(self, text):
        return 10

    def embed_many(self, texts):
        self.calls.append(texts)

        return [self.vectors[index] for index in range(len(texts))], 10 * len(texts)


class FakeCache:
    def __init__(self, stored=None):
        self.stored = dict(stored or {})
        self.puts = []

    def get(self, keys, model):
        return {key: self.stored[key] for key in keys if key in self.stored}

    def put(self, entries, model):
        self.puts.append(entries)
        self.stored.update({(roadmap_id, digest): vector for roadmap_id, digest, vector in entries})


def candidate(roadmap_id, title):
    return {
        "roadmapId": roadmap_id,
        "title": title,
        "description": "A roadmap.",
        "level": "beginner",
        "concepts": ["one"],
        "steps": ["First step"],
    }


def context(candidates):
    return RecommendationContext(
        sessionId="session",
        goal="Learn to design PostgreSQL tables",
        level="beginner",
        candidates=candidates,
    )


def test_empty_catalog_makes_no_model_call():
    embedder = FakeEmbedder([])

    result = recommend(context([]), 8000, embedder, FakeCache(), lambda: True)

    assert result["matches"] == []
    assert result["tokens"] == 0
    assert embedder.calls == []


def test_embeds_only_uncached_candidates_and_caches_them():
    snapshot = context([candidate("sql", "SQL schemas"), candidate("react", "React state")])
    sql_key = ("sql", content_hash(candidate_text(snapshot.candidates[0])))
    react_key = ("react", content_hash(candidate_text(snapshot.candidates[1])))
    cache = FakeCache({sql_key: [1.0, 0.0]})
    # Goal first, then the one missing candidate.
    embedder = FakeEmbedder([[1.0, 0.0], [0.0, 1.0]])

    result = recommend(snapshot, 8000, embedder, cache, lambda: True)

    assert len(embedder.calls[0]) == 2
    assert cache.puts == [[("react", react_key[1], [0.0, 1.0])]]
    assert result["matches"] == [{"roadmapId": "sql", "similarity": 1.0}]
    assert (result["cached"], result["embedded"], result["tokens"]) == (1, 1, 20)


def test_only_relevant_candidate_beyond_budget_is_inconclusive_and_retry_uses_cache():
    snapshot = context([candidate("a", "Unrelated"), candidate("b", "Relevant")])
    cache = FakeCache()
    a_key = ("a", content_hash(candidate_text(snapshot.candidates[0])))
    embedder = FakeEmbedder([[1.0, 0.0], [0.0, 1.0]])

    result = recommend(snapshot, 20, embedder, cache, lambda: True)

    assert len(embedder.calls[0]) == 2
    assert result["reason"] == "budget"
    assert result["matches"] == []
    assert result["tokens"] == 20
    assert result["embedded"] == 1
    assert cache.puts == [[("a", a_key[1], [0.0, 1.0])]]

    retry_embedder = FakeEmbedder([[1.0, 0.0], [1.0, 0.0]])

    retry = recommend(snapshot, 20, retry_embedder, cache, lambda: True)

    assert retry["reason"] is None
    assert retry["matches"] == [{"roadmapId": "b", "similarity": 1.0}]
    assert retry["cached"] == 1
    assert retry_embedder.calls[0] == [snapshot.goal, candidate_text(snapshot.candidates[1])]


def test_goal_over_budget_makes_no_embedding_call():
    embedder = FakeEmbedder([])

    result = recommend(context([candidate("a", "A")]), 9, embedder, FakeCache(), lambda: True)

    assert result["reason"] == "budget"
    assert result["matches"] == []
    assert result["tokens"] == 0
    assert embedder.calls == []


def test_cached_catalog_needs_only_the_goal_budget():
    snapshot = context([candidate("a", "A")])
    key = ("a", content_hash(candidate_text(snapshot.candidates[0])))
    cache = FakeCache({key: [1.0, 0.0]})
    embedder = FakeEmbedder([[1.0, 0.0]])

    result = recommend(snapshot, 10, embedder, cache, lambda: True)

    assert result["reason"] is None
    assert result["matches"] == [{"roadmapId": "a", "similarity": 1.0}]
    assert result["tokens"] == 10
    assert embedder.calls == [[snapshot.goal]]


def test_cancelled_check_spends_nothing():
    embedder = FakeEmbedder([])

    result = recommend(context([candidate("a", "A")]), 8000, embedder, FakeCache(), lambda: False)

    assert result["reason"] == "cancelled"
    assert embedder.calls == []
