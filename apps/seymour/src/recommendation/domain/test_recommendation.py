import pytest

from src.recommendation.domain.recommendation import (
    CANDIDATE_TEXT_LIMIT,
    MAX_MATCHES,
    SIMILARITY_THRESHOLD,
    Candidate,
    candidate_text,
    content_hash,
    cosine,
    rank,
)

pytestmark = pytest.mark.unit


def candidate(roadmap_id, level="intermediate", title="Hexagonal NestJS"):
    return Candidate(
        roadmapId=roadmap_id,
        title=title,
        description="Ports and adapters.",
        level=level,
        concepts=["ports", "adapters"],
        steps=["Define ports", "Write adapters"],
    )


def unit(angle_cosine):
    # A 2-d vector whose cosine with (1, 0) is the given value.
    return [angle_cosine, (1 - angle_cosine**2) ** 0.5]


def test_candidate_text_is_bounded_and_hash_is_stable():
    long = candidate("long", title="x" * 2000)

    text = candidate_text(long)

    assert len(text) == CANDIDATE_TEXT_LIMIT
    assert content_hash(text) == content_hash(candidate_text(long))
    assert content_hash(text) != content_hash(candidate_text(candidate("other")))


def test_cosine_handles_zero_vectors():
    assert cosine([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert cosine([0.0, 0.0], [1.0, 0.0]) == 0.0


def test_rank_keeps_matches_above_threshold_best_first():
    below = SIMILARITY_THRESHOLD - 0.05
    compared = [
        (candidate("low"), unit(below)),
        (candidate("mid"), unit(0.6)),
        (candidate("high"), unit(0.8)),
    ]

    matches = rank([1.0, 0.0], compared, "intermediate")

    assert [match["roadmapId"] for match in matches] == ["high", "mid"]
    assert matches[0]["similarity"] == pytest.approx(0.8, abs=1e-4)


def test_rank_prefers_same_level_on_near_ties_and_caps_matches():
    compared = [
        (candidate("other-level", level="advanced"), unit(0.61)),
        (candidate("same-level"), unit(0.60)),
        (candidate("third"), unit(0.5)),
        (candidate("fourth"), unit(0.45)),
    ]

    matches = rank([1.0, 0.0], compared, "intermediate")

    assert len(matches) == MAX_MATCHES
    assert matches[0]["roadmapId"] == "same-level"


def test_rank_breaks_equal_scores_by_roadmap_id():
    compared = [
        (candidate("z-roadmap"), unit(0.6)),
        (candidate("a-roadmap"), unit(0.6)),
    ]

    matches = rank([1.0, 0.0], compared, "intermediate")

    assert [match["roadmapId"] for match in matches] == ["a-roadmap", "z-roadmap"]


def test_rank_uses_the_supplied_threshold_before_applying_level_bonus():
    compared = [
        (candidate("below"), unit(0.79)),
        (candidate("above", level="advanced"), unit(0.81)),
    ]

    matches = rank([1.0, 0.0], compared, "intermediate", threshold=0.8)

    assert [match["roadmapId"] for match in matches] == ["above"]
