"""Runs against PostgreSQL + pgvector when SEYMOUR_TEST_DATABASE_URL is set."""

import os
import uuid

import psycopg
import pytest

from src.recommendation.infrastructure.pg_embedding_cache import PgEmbeddingCache

URL = os.environ.get("SEYMOUR_TEST_DATABASE_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not URL, reason="SEYMOUR_TEST_DATABASE_URL is not set"),
]


def axis(index):
    values = [0.0] * 1536
    values[index] = 1.0

    return values


@pytest.fixture
def cache():
    roadmap = f"test-{uuid.uuid4()}"

    yield PgEmbeddingCache(lambda: psycopg.connect(URL)), roadmap

    with psycopg.connect(URL, autocommit=True) as connection:
        connection.execute(
            "DELETE FROM seymour.catalog_embedding WHERE roadmap_id = %s", (roadmap,)
        )


def test_stores_once_and_reads_by_roadmap_hash_and_model(cache):
    store, roadmap = cache
    digest = "a" * 64
    other = "b" * 64

    store.put([(roadmap, digest, axis(0))], "model-a")
    store.put([(roadmap, digest, axis(1))], "model-a")

    found = store.get([(roadmap, digest), (roadmap, other)], "model-a")
    other_model = store.get([(roadmap, digest)], "model-b")

    assert list(found) == [(roadmap, digest)]
    assert found[(roadmap, digest)] == axis(0)
    assert other_model == {}
