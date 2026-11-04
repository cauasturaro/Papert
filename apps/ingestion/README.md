# Ingestion

The document-processing worker for Papert's workspace sources.

Learners upload PDF, DOC, DOCX and Markdown files straight to S3 after Core
registers them. S3 notifies the ingestion queue; this worker asks Core to
confirm the object, extracts located text, splits it into passages, creates
OpenAI embeddings and stores them in PostgreSQL with pgvector.

Locally, `make up-all` starts it as the `ingestion-runner` service.

Tests (from this folder, with a Python virtual environment):

```sh
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```

Unit tests live beside the code in `src/` and can be selected with `-m unit`.
Database integration tests remain in `tests/` and use `-m integration`.

Set `INGESTION_TEST_DATABASE_URL` to a `seymour_user` connection to include
the database tests. The database must have pgvector enabled and the Seymour
Alembic migrations applied.

See the [project README](../../README.md) for running the services.
