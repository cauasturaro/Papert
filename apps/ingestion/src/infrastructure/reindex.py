"""Inventory incompatible indexed sources and optionally enqueue a maintenance reindex."""

import argparse
import json
import os

import boto3

from src.infrastructure.embeddings import DIMENSIONS
from src.infrastructure.store import PIPELINE_REVISION, connect


def inventory(connection, model):
    with connection.transaction(), connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT document_id::text FROM seymour.source_document
            WHERE NOT deleted AND object_version_id IS NOT NULL
              AND (embedding_model IS DISTINCT FROM %s
                   OR embedding_dimensions IS DISTINCT FROM %s
                   OR pipeline_revision IS DISTINCT FROM %s)
            ORDER BY document_id
            """,
            (model, DIMENSIONS, PIPELINE_REVISION),
        )

        return [row[0] for row in cursor.fetchall()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue-url", help="Send reindex jobs; omit to print inventory only")
    arguments = parser.parse_args()
    model = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")

    with connect() as connection:
        documents = inventory(connection, model)

    if arguments.queue_url:
        queue = boto3.client("sqs")
        for document_id in documents:
            queue.send_message(
                QueueUrl=arguments.queue_url,
                MessageBody=json.dumps({"PapertReindex": {"documentId": document_id}}),
            )

    print(
        json.dumps({"model": model, "pipelineRevision": PIPELINE_REVISION, "documents": documents})
    )


if __name__ == "__main__":
    main()
