"""Compare a draft's goal with published roadmaps by embedding similarity; no chat model."""

from collections.abc import Callable

from src.recommendation.domain.ports import EmbeddingCache, TextEmbedder
from src.recommendation.domain.recommendation import (
    RecommendationContext,
    candidate_text,
    content_hash,
    goal_text,
    rank,
)


def recommend(
    context: RecommendationContext,
    budget: int,
    embedder: TextEmbedder,
    cache: EmbeddingCache,
    active: Callable[[], bool],
) -> dict:
    """Returns matches, tokens spent and cache counts; `reason` is set when it stopped early."""
    if not context.candidates:
        return {"matches": [], "tokens": 0, "cached": 0, "embedded": 0, "reason": None}

    texts = {candidate.roadmapId: candidate_text(candidate) for candidate in context.candidates}
    keys = [(roadmap_id, content_hash(text)) for roadmap_id, text in texts.items()]

    cached = cache.get(keys, embedder.model)
    missing = [key for key in keys if key not in cached]

    # Roadmaps are immutable, so a cached vector stays valid; only new ones cost tokens.
    goal = goal_text(context.goal)
    allowance = budget - embedder.count_tokens(goal)
    batch = []

    for key in missing:
        cost = embedder.count_tokens(texts[key[0]])

        if cost > allowance:
            break

        allowance -= cost
        batch.append(key)

    if not active():
        return {
            "matches": [],
            "tokens": 0,
            "cached": len(cached),
            "embedded": 0,
            "reason": "cancelled",
        }

    if allowance < 0:
        return {
            "matches": [],
            "tokens": 0,
            "cached": len(cached),
            "embedded": 0,
            "reason": "budget",
        }

    vectors, tokens = embedder.embed_many([goal, *[texts[key[0]] for key in batch]])
    goal_vector = vectors[0]
    fresh = dict(zip(batch, vectors[1:], strict=True))

    if fresh:
        cache.put([(key[0], key[1], vector) for key, vector in fresh.items()], embedder.model)

    if len(batch) < len(missing):
        return {
            "matches": [],
            "tokens": tokens,
            "cached": len(cached),
            "embedded": len(fresh),
            "reason": "budget",
        }

    known = {**cached, **fresh}
    compared = [
        (candidate, known[key])
        for candidate, key in zip(context.candidates, keys, strict=True)
        if key in known
    ]

    return {
        "matches": rank(goal_vector, compared, context.level),
        "tokens": tokens,
        "cached": len(cached),
        "embedded": len(fresh),
        "reason": None,
    }
