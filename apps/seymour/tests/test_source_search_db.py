"""Runs against PostgreSQL + pgvector when SEYMOUR_TEST_DATABASE_URL is set."""

import json
import os
import uuid
from types import SimpleNamespace

import psycopg
import pytest

from src.retrieval.application.search import SourceSearch
from src.retrieval.infrastructure.openai_embedder import OpenAIQueryEmbedder
from src.retrieval.infrastructure.pgvector_index import PgvectorPassageIndex

URL = os.environ.get("SEYMOUR_TEST_DATABASE_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not URL, reason="SEYMOUR_TEST_DATABASE_URL is not set"),
]


class FixedEmbedding:
    """Embeds every query as the first axis, so axis-aligned chunks rank predictably."""

    def __init__(self):
        self.embeddings = self

    def create(self, **_arguments):
        vector = [1.0] + [0.0] * 1535

        return SimpleNamespace(
            data=[SimpleNamespace(index=0, embedding=vector)],
            usage=SimpleNamespace(prompt_tokens=4, total_tokens=4),
        )


def vector(axis):
    values = [0.0] * 1536
    values[axis] = 1.0

    return "[" + ",".join(str(value) for value in values) + "]"


@pytest.fixture
def indexed():
    connection = psycopg.connect(URL, autocommit=True)
    workspace = str(uuid.uuid4())
    document = str(uuid.uuid4())
    deleted = str(uuid.uuid4())

    for document_id, is_deleted in [(document, False), (deleted, True)]:
        connection.execute(
            "INSERT INTO seymour.source_document (document_id, workspace_id, deleted, embedding_model, embedding_dimensions, pipeline_revision) VALUES (%s, %s, %s, 'test', 1536, '2')",
            (document_id, workspace, is_deleted),
        )

    chunks = [
        (document, 0, "page four ends the example {", 0, 4),
        (document, 1, '"Placa": "XXX"}', 30, 5),
        (document, 2, "unrelated page", 60, 6),
        (deleted, 0, "deleted document", 0, 1),
    ]

    for document_id, ordinal, content, start, page in chunks:
        # Ordinal 0 of each document matches the query best.
        axis = 0 if ordinal == 0 else ordinal + 10
        connection.execute(
            """
            INSERT INTO seymour.source_chunk
              (document_id, workspace_id, ordinal, content, location,
               char_start, char_end, token_count, embedding)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, 1, %s::vector)
            """,
            (
                document_id,
                workspace,
                ordinal,
                content,
                json.dumps({"page": page}),
                start,
                start + len(content),
                vector(axis),
            ),
        )

    yield workspace, document, deleted

    connection.execute(
        "DELETE FROM seymour.source_document WHERE document_id = ANY(%s::uuid[])",
        ([document, deleted],),
    )
    connection.close()


def test_search_adds_the_following_chunk_and_skips_unauthorized_or_deleted(indexed):
    workspace, document, deleted = indexed
    embedder = OpenAIQueryEmbedder(client=FixedEmbedding(), model="test")
    index = PgvectorPassageIndex(connect=lambda: psycopg.connect(URL))
    search = SourceSearch(workspace, [document, deleted], embedder, index)
    foreign = SourceSearch(str(uuid.uuid4()), [document], embedder, index)

    # Fetch only the best match so the following chunk must be added, independent of ties.
    passages, tokens = search.search("example", [document, deleted], 1)
    other_workspace, _ = foreign.search("example", [document], 2)

    assert tokens == 4
    assert [passage["content"] for passage in passages][:2] == [
        "page four ends the example {",
        '"Placa": "XXX"}',
    ]
    assert all(passage["documentId"] == document for passage in passages)
    assert passages[1]["distance"] == passages[0]["distance"]
    assert other_workspace == []


@pytest.mark.parametrize(
    "metadata",
    [
        {"embedding_model": "another-model"},
        {"embedding_dimensions": 768},
        {"pipeline_revision": "1"},
    ],
)
def test_incompatible_embedding_spaces_and_pipeline_revisions_are_excluded(indexed, metadata):
    workspace, document, _deleted = indexed
    column, value = next(iter(metadata.items()))
    with psycopg.connect(URL) as connection:
        from psycopg import sql

        connection.execute(
            sql.SQL("UPDATE seymour.source_document SET {} = %s WHERE document_id = %s").format(
                sql.Identifier(column)
            ),
            (value, document),
        )

    index = PgvectorPassageIndex(connect=lambda: psycopg.connect(URL))
    query = [1.0] + [0.0] * 1535

    passages = index.nearest(workspace, [document], query, 5, "test")
    following = index.following(workspace, {"documentId": document, "ordinal": 0}, "test")

    assert passages == []
    assert following is None


def test_exact_authorized_ranking_is_not_exhausted_by_other_workspaces(indexed):
    workspace, document, _deleted = indexed
    foreign_document, foreign_workspace = str(uuid.uuid4()), str(uuid.uuid4())
    query = [1.0] + [0.0] * 1535
    with psycopg.connect(URL) as connection:
        connection.execute(
            """INSERT INTO seymour.source_document
               (document_id, workspace_id, embedding_model, embedding_dimensions, pipeline_revision)
               VALUES (%s, %s, 'test', 1536, '2')""",
            (foreign_document, foreign_workspace),
        )
        connection.execute(
            """INSERT INTO seymour.source_chunk
               (document_id, workspace_id, ordinal, content, location, char_start, char_end, token_count, embedding)
               SELECT %s, %s, ordinal, 'foreign distractor', '{}'::jsonb, 0, 18, 3, %s::vector
               FROM generate_series(0, 999) ordinal""",
            (foreign_document, foreign_workspace, vector(0)),
        )

    try:
        index = PgvectorPassageIndex(connect=lambda: psycopg.connect(URL))

        passages = index.nearest(workspace, [document, foreign_document], query, 3, "test")

        assert len(passages) == 3
        assert {passage["documentId"] for passage in passages} == {document}
        assert passages[0]["ordinal"] == 0
    finally:
        with psycopg.connect(URL) as connection:
            connection.execute(
                "DELETE FROM seymour.source_document WHERE document_id = %s", (foreign_document,)
            )
