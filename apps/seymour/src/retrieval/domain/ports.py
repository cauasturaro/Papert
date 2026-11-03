"""Retrieval contracts; adapters live in retrieval/infrastructure."""

from collections.abc import Callable
from typing import Protocol, TypedDict


class Passage(TypedDict):
    """An indexed chunk of a learner's source, as returned by a search."""

    documentId: str
    ordinal: int
    start: int
    content: str
    location: dict
    # Cosine distance: 0 is identical, larger is less related. None for a following chunk.
    distance: float | None


class QueryEmbedder(Protocol):
    def embed(self, query: str) -> tuple[list[float], int]:
        """Returns the query vector and the tokens spent."""


class PassageIndex(Protocol):
    def nearest(
        self, workspace_id: str, document_ids: list[str], vector: list[float], limit: int
    ) -> list[Passage]: ...

    def following(self, workspace_id: str, passage: Passage) -> Passage | None: ...


# (query, authorized document ids) -> (passages, embedding tokens); used by the tutor.
Search = Callable[[str, list[str]], tuple[list[Passage], int]]
