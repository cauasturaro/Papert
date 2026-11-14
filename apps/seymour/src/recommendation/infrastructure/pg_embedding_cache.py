"""Candidate vectors in seymour.catalog_embedding; roadmap ids are opaque keys from Core."""

import json

from src.shared.infrastructure.postgres import connect, vector_literal


class PgEmbeddingCache:
    def __init__(self, connect=connect):
        self.connect = connect

    def get(self, keys, model):
        if not keys:
            return {}

        roadmap_ids = [key[0] for key in keys]
        hashes = [key[1] for key in keys]

        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT roadmap_id, content_hash, embedding::text
                FROM seymour.catalog_embedding
                WHERE model = %s
                  AND (roadmap_id, content_hash) IN (
                    SELECT * FROM unnest(%s::varchar[], %s::char(64)[])
                  )
                """,
                (model, roadmap_ids, hashes),
            )
            rows = cursor.fetchall()

        return {(row[0], row[1].strip()): json.loads(row[2]) for row in rows}

    def put(self, entries, model):
        with self.connect() as connection, connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO seymour.catalog_embedding (roadmap_id, content_hash, model, embedding)
                VALUES (%s, %s, %s, %s::vector)
                ON CONFLICT (roadmap_id, content_hash, model) DO NOTHING
                """,
                [
                    (roadmap_id, digest, model, vector_literal(vector))
                    for roadmap_id, digest, vector in entries
                ],
            )
