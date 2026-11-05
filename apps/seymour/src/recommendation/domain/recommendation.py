"""Community recommendation contracts and pure ranking rules. Core decides what is shown."""

import hashlib
import math
from typing import Annotated, Literal

from pydantic import Field

from src.shared.domain.workspace import StrictModel

Level = Literal["beginner", "intermediate", "advanced"]

# Calibrated on evals/recommendation.json.
SIMILARITY_THRESHOLD = 0.35
# A same-level roadmap wins a near tie; it never lifts an unrelated one over the threshold.
LEVEL_BONUS = 0.02
MAX_MATCHES = 3
MAX_CANDIDATES = 50
# Bound candidate text to limit embedding costs.
CANDIDATE_TEXT_LIMIT = 600
GOAL_TEXT_LIMIT = 600


class Candidate(StrictModel):
    """Public text of a published roadmap, as Core snapshotted it."""

    roadmapId: Annotated[str, Field(pattern=r"^[a-z0-9-]{1,100}$")]
    title: Annotated[str, Field(min_length=1, max_length=8000)]
    description: Annotated[str, Field(min_length=1, max_length=8000)]
    level: Level | None
    concepts: Annotated[list[Annotated[str, Field(max_length=80)]], Field(max_length=6)]
    steps: Annotated[list[Annotated[str, Field(max_length=8000)]], Field(max_length=50)]


class RecommendationContext(StrictModel):
    """Core-authorized snapshot of a draft's check; the goal is untrusted learner text."""

    sessionId: Annotated[str, Field(min_length=1, max_length=100)]
    goal: Annotated[str, Field(min_length=10, max_length=500)]
    level: Level
    candidates: Annotated[list[Candidate], Field(max_length=MAX_CANDIDATES)]


def candidate_text(candidate: Candidate) -> str:
    parts = [
        candidate.title,
        candidate.description,
        "Concepts: " + ", ".join(candidate.concepts),
        "Steps: " + "; ".join(candidate.steps),
    ]

    return "\n".join(parts)[:CANDIDATE_TEXT_LIMIT]


def goal_text(goal: str) -> str:
    # The level is applied in ranking; embedding it would pull goals toward level words.
    return goal.strip()[:GOAL_TEXT_LIMIT]


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))

    if norm == 0:
        return 0.0

    return dot / norm


def rank(
    goal_vector: list[float],
    candidates: list[tuple[Candidate, list[float]]],
    level: str,
    threshold: float = SIMILARITY_THRESHOLD,
) -> list[dict]:
    """Matches above the threshold, best first, at most MAX_MATCHES."""
    scored = []

    for candidate, vector in candidates:
        similarity = cosine(goal_vector, vector)

        if similarity < threshold:
            continue

        bonus = LEVEL_BONUS if candidate.level == level else 0.0
        scored.append((similarity + bonus, similarity, candidate.roadmapId))

    scored.sort(key=lambda item: (-item[0], item[2]))

    return [
        {"roadmapId": roadmap_id, "similarity": round(similarity, 4)}
        for _, similarity, roadmap_id in scored[:MAX_MATCHES]
    ]
