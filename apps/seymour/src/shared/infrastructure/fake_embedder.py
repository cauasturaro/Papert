"""Deterministic bag-of-words embeddings for demos and browser tests without a provider key.

Texts that share words get close vectors, so recommendation ranking still behaves sensibly.
The model name differs from any real one, so these vectors never match real source chunks.
"""

import hashlib
import math
import re

FAKE_EMBEDDING_MODEL = "papert-fake-embedding"
DIMENSIONS = 1536
WORD = re.compile(r"\w+")


def words(text: str) -> list[str]:
    return WORD.findall(text.lower())


def bucket(word: str) -> int:
    digest = hashlib.sha256(word.encode("utf-8")).digest()

    return int.from_bytes(digest[:4], "big") % DIMENSIONS


class FakeEmbedder:
    """Implements both the query embedder and the batch text embedder ports."""

    model = FAKE_EMBEDDING_MODEL

    def count_tokens(self, text: str) -> int:
        return max(1, len(words(text)))

    def vector(self, text: str) -> list[float]:
        counts = [0.0] * DIMENSIONS

        for word in words(text):
            counts[bucket(word)] += 1.0

        # A zero vector has no cosine distance; wordless text gets one fixed direction.
        if not any(counts):
            counts[0] = 1.0

        norm = math.sqrt(sum(value * value for value in counts))

        return [value / norm for value in counts]

    def embed(self, query: str) -> tuple[list[float], int]:
        return self.vector(query), self.count_tokens(query)

    def embed_many(self, texts: list[str]) -> tuple[list[list[float]], int]:
        vectors = [self.vector(text) for text in texts]
        tokens = sum(self.count_tokens(text) for text in texts)

        return vectors, tokens
