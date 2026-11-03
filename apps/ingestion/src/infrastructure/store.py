"""Chunk/vector persistence in Seymour's schema, serialized per document."""

import json
import os

import psycopg

from src.domain.versions import ObjectVersion, StoredVersion, clear_allowed, write_decision


def connect():
    url = os.environ["SEYMOUR_DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://", 1)

    return psycopg.connect(url, connect_timeout=10)


def _vector(values):
    return "[" + ",".join(repr(float(value)) for value in values) + "]"


def _lock(cursor, document_id, workspace_id):
    cursor.execute(
        """
        INSERT INTO seymour.source_document (document_id, workspace_id)
        VALUES (%s, %s)
        ON CONFLICT (document_id) DO NOTHING
        """,
        (document_id, workspace_id),
    )

    cursor.execute(
        """
        SELECT workspace_id::text, object_version_id, sequencer, deleted, indexed_at IS NOT NULL
        FROM seymour.source_document
        WHERE document_id = %s
        FOR UPDATE
        """,
        (document_id,),
    )

    stored_workspace, *state = cursor.fetchone()

    if stored_workspace != workspace_id:
        raise RuntimeError("Indexed document belongs to another workspace")

    return StoredVersion(*state)


class SourceStore:
    def __init__(self, connection):
        self.connection = connection

    def write(
        self,
        document_id,
        workspace_id,
        version_id,
        sequencer,
        chunks,
        embedded,
        character_count,
        replace=False,
    ):
        """Replaces the document's chunks unless the version is stale or deleted."""
        with self.connection.transaction(), self.connection.cursor() as cursor:
            stored = _lock(cursor, document_id, workspace_id)
            incoming = ObjectVersion(version_id, sequencer)
            decision = write_decision(stored, incoming, replace)
            if decision != "write":
                return decision

            cursor.execute(
                "DELETE FROM seymour.source_chunk WHERE document_id = %s", (document_id,)
            )

            rows = [
                (
                    document_id,
                    workspace_id,
                    piece.ordinal,
                    piece.content,
                    json.dumps(piece.location),
                    piece.char_start,
                    piece.char_end,
                    piece.token_estimate,
                    _vector(vector),
                )
                for piece, vector in zip(chunks, embedded.vectors, strict=True)
            ]

            cursor.executemany(
                """
                INSERT INTO seymour.source_chunk
                  (document_id, workspace_id, ordinal, content, location,
                   char_start, char_end, token_count, embedding)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s::vector)
                """,
                rows,
            )

            cursor.execute(
                """
                UPDATE seymour.source_document
                SET object_version_id = %s,
                    sequencer = %s,
                    chunk_count = %s,
                    character_count = %s,
                    embedding_model = %s,
                    embedding_dimensions = %s,
                    indexed_at = now(),
                    updated_at = now()
                WHERE document_id = %s
                """,
                (
                    version_id,
                    sequencer.upper(),
                    len(chunks),
                    character_count,
                    embedded.model,
                    len(embedded.vectors[0]) if embedded.vectors else None,
                    document_id,
                ),
            )

            return "written"

    def clear(self, document_id, workspace_id, version_id, sequencer):
        """Drops chunks of an older version when a newer version cannot be indexed."""
        with self.connection.transaction(), self.connection.cursor() as cursor:
            stored = _lock(cursor, document_id, workspace_id)
            incoming = ObjectVersion(version_id, sequencer)
            if not clear_allowed(stored, incoming):
                return

            cursor.execute(
                "DELETE FROM seymour.source_chunk WHERE document_id = %s", (document_id,)
            )
            cursor.execute(
                """
                UPDATE seymour.source_document
                SET object_version_id = %s, sequencer = %s, chunk_count = 0,
                    character_count = 0, indexed_at = NULL, updated_at = now()
                WHERE document_id = %s
                """,
                (version_id, sequencer.upper(), document_id),
            )

    def purge(self, document_id, workspace_id):
        """Tombstones the document so no later write can restore its chunks."""
        with self.connection.transaction(), self.connection.cursor() as cursor:
            _lock(cursor, document_id, workspace_id)

            cursor.execute(
                "DELETE FROM seymour.source_chunk WHERE document_id = %s", (document_id,)
            )
            cursor.execute(
                """
                UPDATE seymour.source_document
                SET deleted = true, chunk_count = 0, character_count = 0,
                    indexed_at = NULL, updated_at = now()
                WHERE document_id = %s
                """,
                (document_id,),
            )
