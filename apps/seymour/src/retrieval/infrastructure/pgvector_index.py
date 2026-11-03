"""pgvector queries over seymour.source_chunk; tombstoned documents are excluded."""

import json
import os

import psycopg

from src.retrieval.domain.ports import Passage


def _vector(values):
    return "[" + ",".join(repr(float(value)) for value in values) + "]"


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


def connect():
    url = os.environ["SEYMOUR_DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://", 1)

    return psycopg.connect(url, connect_timeout=5)


class PgvectorPassageIndex:
    def __init__(self, connect=connect):
        self.connect = connect

    def nearest(
        self, workspace_id: str, document_ids: list[str], vector: list[float], limit: int
    ) -> list[Passage]:
        literal = _vector(vector)

        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT c.document_id::text, c.ordinal, c.char_start, c.content, c.location,
                       c.embedding <=> %s::vector AS distance
                FROM seymour.source_chunk c
                JOIN seymour.source_document d ON d.document_id = c.document_id
                WHERE c.workspace_id = %s
                  AND c.document_id = ANY(%s::uuid[])
                  AND NOT d.deleted
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
                """,
                (literal, workspace_id, document_ids, literal, limit),
            )
            rows = cursor.fetchall()

        return [_passage(row) for row in rows]

    def following(self, workspace_id: str, passage: Passage) -> Passage | None:
        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT document_id::text, ordinal, char_start, content, location, NULL
                FROM seymour.source_chunk
                WHERE workspace_id = %s AND document_id = %s AND ordinal = %s
                """,
                (workspace_id, passage["documentId"], passage["ordinal"] + 1),
            )
            row = cursor.fetchone()

        return _passage(row) if row else None
