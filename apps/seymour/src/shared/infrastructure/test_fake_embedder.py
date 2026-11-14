import math

import pytest

from src.shared.infrastructure.fake_embedder import DIMENSIONS, FakeEmbedder

pytestmark = pytest.mark.unit


def cosine(first, second):
    return sum(a * b for a, b in zip(first, second, strict=True))


def test_vectors_are_deterministic_unit_vectors_of_the_indexed_size():
    embedder = FakeEmbedder()

    vector, tokens = embedder.embed("Hexagonal architecture with NestJS")
    again, _ = embedder.embed("Hexagonal architecture with NestJS")

    assert len(vector) == DIMENSIONS
    assert vector == again
    assert math.isclose(math.sqrt(cosine(vector, vector)), 1.0)
    assert tokens == 4


def test_texts_sharing_words_are_closer_than_unrelated_texts():
    embedder = FakeEmbedder()

    (goal, related, unrelated), tokens = embedder.embed_many(
        ["NestJS hexagonal ports", "Hexagonal ports and adapters", "Docker image layers"]
    )

    assert cosine(goal, related) > cosine(goal, unrelated)
    assert tokens == 10


def test_wordless_text_still_has_a_direction():
    vector, tokens = FakeEmbedder().embed("  ")

    assert tokens == 1
    assert math.isclose(sum(value * value for value in vector), 1.0)
