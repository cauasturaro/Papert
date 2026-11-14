"""Recommendation contracts; adapters live in recommendation/infrastructure."""

from typing import Protocol


class TextEmbedder(Protocol):
    model: str

    def count_tokens(self, text: str) -> int:
        """Returns the exact token count for this embedding model."""
        ...

    def embed_many(self, texts: list[str]) -> tuple[list[list[float]], int]:
        """Returns one vector per text, in order, and the tokens spent."""
        ...


class EmbeddingCache(Protocol):
    def get(self, keys: list[tuple[str, str]], model: str) -> dict[tuple[str, str], list[float]]:
        """Cached vectors by (roadmap id, content hash) for this model."""
        ...

    def put(self, entries: list[tuple[str, str, list[float]]], model: str) -> None:
        """Stores (roadmap id, content hash, vector); existing rows are kept."""
