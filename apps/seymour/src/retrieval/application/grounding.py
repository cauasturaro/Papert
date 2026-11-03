"""Turns retrieved passages into cited excerpts the tutor can show the model."""

from src.retrieval.domain.citation import cite
from src.retrieval.domain.ports import Passage, Search

SEARCH_LIMIT = 4
# Whole chunks (the chunker caps them at 1,600 characters) so examples are not cut.
EXCERPT_CHARACTERS = 1600

# Measured with text-embedding-3-small on 2026-11-03: related questions scored
# 0.22-0.55 and unrelated ones 0.88-0.94. Revisit with the Phase 13 evals.
GROUNDING_DISTANCE = 0.72
GROUNDING_LIMIT = 3
# Bounds the tokens grounding adds to every model call of the attempt.
GROUNDING_TOTAL_CHARACTERS = 4800


def cited_excerpts(
    filenames: dict[str, str], passages: list[Passage], characters: int
) -> list[dict]:
    """Keeps passages of authorized documents only, each with a readable citation."""
    return [
        {
            "sourceId": passage["documentId"],
            "cite": cite(filenames[passage["documentId"]], passage["location"]),
            "start": passage.get("start", 0),
            "text": passage["content"][:characters],
        }
        for passage in passages
        if passage["documentId"] in filenames
    ]


def grounding(
    filenames: dict[str, str], mentioned: list[str], query: str, search: Search | None
) -> list[dict]:
    """Excerpts retrieved for every request, so sources are used without being asked.

    Mentioned sources are always searched; otherwise only clearly related passages
    (cosine distance within GROUNDING_DISTANCE) are kept.
    """
    if not filenames or search is None:
        return []

    targets = mentioned or list(filenames)
    passages, _tokens = search(query, targets)

    if not mentioned:
        passages = [
            passage
            for passage in passages
            if passage["distance"] is not None and passage["distance"] <= GROUNDING_DISTANCE
        ]

    excerpts = cited_excerpts(filenames, passages[:GROUNDING_LIMIT], EXCERPT_CHARACTERS)
    kept = []
    total = 0

    for excerpt in excerpts:
        total += len(excerpt["text"])

        if total > GROUNDING_TOTAL_CHARACTERS:
            break

        kept.append(excerpt)

    return kept
