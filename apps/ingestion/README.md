# Ingestion

**English** · [Português](README.pt-BR.md)

The document-processing worker for workspace sources: a Python Lambda, run locally as the
`ingestion-runner` service.

Learners upload PDF, DOC, DOCX and Markdown files directly to S3 after Core registers them.
For each S3 event, this worker:

1. asks Core whether that exact object version may be processed;
2. checks that the content matches the declared format;
3. extracts text with its location (page, line range, or paragraph and heading);
4. splits it into overlapping passages that never cross a PDF page;
5. creates OpenAI embeddings;
6. replaces the document's vectors in PostgreSQL with pgvector, in one locked transaction.

Scanned, encrypted or corrupt files fail with a stable error code instead of producing
invented text. Duplicate and out-of-order events are ignored using S3 sequencers and
tombstones. Design: [ADR 0005](../../docs/adr/0005-upload-ingestion-and-scoped-retrieval.md).

## Development

To run the whole stack, see the [project README](../../README.md#quick-start).

```sh
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -m unit
```

Unit tests live beside the code in `src/`. The vector-store tests in `tests/` use
`-m integration` and need `INGESTION_TEST_DATABASE_URL`, a `seymour_user` connection to a
database with pgvector and Seymour's Alembic migrations applied.

## Maintenance

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `make ingestion-redrive` | Moves dead-lettered messages back to the queue |
| `make ingestion-reindex` | Re-extracts every finished source |

Changing the embedding model or the extraction pipeline needs a maintenance window. The
procedure and the handling of failed queue records are in the
[operations guide](../../docs/operations.md).
