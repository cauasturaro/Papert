"""Runs against PostgreSQL + pgvector when INGESTION_TEST_DATABASE_URL is set."""

import os
import uuid

import psycopg
import pytest

from src.application.ports import Embedded
from src.domain.chunking import Chunk
from src.infrastructure.store import SourceStore

URL = os.environ.get("INGESTION_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not URL, reason="INGESTION_TEST_DATABASE_URL is not set")


@pytest.fixture
def store():
    connection = psycopg.connect(URL)
    created = []

    yield SourceStore(connection), created, connection

    with connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM seymour.source_document WHERE document_id = ANY(%s::uuid[])",
            (created,),
        )

    connection.commit()
    connection.close()


def pieces(count, label):
    chunks = [
        Chunk(index, f"{label} {index}", {"page": index + 1}, index * 10, index * 10 + 5)
        for index in range(count)
    ]
    vectors = [[float(index + 1)] + [0.0] * 1535 for index in range(count)]

    return chunks, Embedded(vectors, tokens=count * 3, model="text-embedding-3-small")


def rows(connection, document_id):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT ordinal, content, workspace_id::text FROM seymour.source_chunk "
            "WHERE document_id = %s ORDER BY ordinal",
            (document_id,),
        )

        return cursor.fetchall()


def test_redelivery_and_older_versions_never_duplicate_or_overwrite(store):
    source_store, created, connection = store
    document, workspace = str(uuid.uuid4()), str(uuid.uuid4())
    created.append(document)

    first = source_store.write(document, workspace, "v2", "00B2", *pieces(3, "current"), 100)
    again = source_store.write(document, workspace, "v2", "00B2", *pieces(3, "current"), 100)
    older = source_store.write(document, workspace, "v1", "00A1", *pieces(5, "old"), 100)

    assert (first, again, older) == ("written", "duplicate", "stale")
    assert [row[1] for row in rows(connection, document)] == ["current 0", "current 1", "current 2"]
    assert {row[2] for row in rows(connection, document)} == {workspace}

    newer = source_store.write(document, workspace, "v3", "00C3", *pieces(2, "newer"), 100)

    assert newer == "written"
    assert [row[1] for row in rows(connection, document)] == ["newer 0", "newer 1"]


def test_purged_documents_cannot_be_restored(store):
    source_store, created, connection = store
    document, workspace = str(uuid.uuid4()), str(uuid.uuid4())
    created.append(document)

    source_store.write(document, workspace, "v1", "0001", *pieces(2, "text"), 100)
    source_store.purge(document, workspace)
    late = source_store.write(document, workspace, "v2", "0002", *pieces(2, "late"), 100)

    assert late == "deleted"
    assert rows(connection, document) == []


def test_failed_newer_version_clears_previous_chunks(store):
    source_store, created, connection = store
    document, workspace = str(uuid.uuid4()), str(uuid.uuid4())
    created.append(document)

    source_store.write(document, workspace, "v1", "0001", *pieces(2, "old"), 100)
    source_store.clear(document, workspace, "v2", "0002")

    assert rows(connection, document) == []


def test_vectors_are_searchable_within_a_workspace(store):
    source_store, created, connection = store
    document, workspace = str(uuid.uuid4()), str(uuid.uuid4())
    created.append(document)

    source_store.write(document, workspace, "v1", "0001", *pieces(3, "text"), 100)

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT ordinal FROM seymour.source_chunk WHERE workspace_id = %s "
            "ORDER BY embedding <=> %s::vector LIMIT 1",
            (workspace, "[3" + ",0" * 1535 + "]"),
        )
        nearest = cursor.fetchone()

        cursor.execute(
            "SELECT count(*) FROM seymour.source_chunk WHERE workspace_id = %s",
            (str(uuid.uuid4()),),
        )
        other_workspace = cursor.fetchone()

    assert nearest is not None
    assert other_workspace == (0,)


def test_reindex_rewrites_the_same_version(store):
    source_store, created, connection = store
    document, workspace = str(uuid.uuid4()), str(uuid.uuid4())
    created.append(document)

    source_store.write(document, workspace, "v1", "0001", *pieces(3, "broken"), 100)
    redelivered = source_store.write(document, workspace, "v1", "0001", *pieces(2, "fixed"), 100)
    reindexed = source_store.write(
        document, workspace, "v1", "0001", *pieces(2, "fixed"), 100, replace=True
    )

    assert (redelivered, reindexed) == ("duplicate", "written")
    assert [row[1] for row in rows(connection, document)] == ["fixed 0", "fixed 1"]
