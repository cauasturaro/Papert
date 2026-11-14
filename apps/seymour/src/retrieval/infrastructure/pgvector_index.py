"""pgvector queries over seymour.source_chunk; tombstoned documents are excluded."""

import json

from src.retrieval.domain.ports import Passage
from src.shared.domain.index_format import DIMENSIONS, PIPELINE_REVISION
from src.shared.infrastructure.postgres import connect, vector_literal


def _passage(row) -> Passage:
    document_id, ordinal, char_start, content, location, distance = row

    return {
        "documentId": document_id,
        "ordinal": ordinal,
        "start": char_start,
        "content": content,
        "location": location if isinstance(location, dict) else json.loads(location),
        "distance": None if distance is None else float(distance),
    }


class PgvectorPassageIndex:
    def __init__(self, connect=connect):
        self.connect = connect

    def nearest(
        self,
        workspace_id: str,
        document_ids: list[str],
        vector: list[float],
        limit: int,
        model: str,
    ) -> list[Passage]:
        literal = vector_literal(vector)

        # Exact ranking of the authorized subset avoids post-filtered ANN recall loss.

        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                WITH authorized AS MATERIALIZED (
                    SELECT c.*
                    FROM seymour.source_chunk c
                    JOIN seymour.source_document d ON d.document_id = c.document_id
                    WHERE c.workspace_id = %s AND d.workspace_id = %s
                      AND c.document_id = ANY(%s::uuid[])
                      AND NOT d.deleted
                      AND d.embedding_model = %s AND d.embedding_dimensions = %s
                      AND d.pipeline_revision = %s
                )
                SELECT document_id::text, ordinal, char_start, content, location,
                       embedding <=> %s::vector AS distance
                FROM authorized
                ORDER BY distance, document_id, ordinal
                LIMIT %s
                """,
                (
                    workspace_id,
                    workspace_id,
                    document_ids,
                    model,
                    DIMENSIONS,
                    PIPELINE_REVISION,
                    literal,
                    limit,
                ),
            )
            rows = cursor.fetchall()

        return [_passage(row) for row in rows]

    def following(self, workspace_id: str, passage: Passage, model: str) -> Passage | None:
        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT c.document_id::text, c.ordinal, c.char_start, c.content, c.location, NULL
                FROM seymour.source_chunk c
                JOIN seymour.source_document d ON d.document_id = c.document_id
                WHERE c.workspace_id = %s AND d.workspace_id = %s
                  AND c.document_id = %s AND c.ordinal = %s
                  AND NOT d.deleted AND d.embedding_model = %s
                  AND d.embedding_dimensions = %s AND d.pipeline_revision = %s
                """,
                (
                    workspace_id,
                    workspace_id,
                    passage["documentId"],
                    passage["ordinal"] + 1,
                    model,
                    DIMENSIONS,
                    PIPELINE_REVISION,
                ),
            )
            row = cursor.fetchone()

        return _passage(row) if row else None
