# Document ingestion

This service will consume S3 object creation events through a dedicated SQS queue, extract document text, split it into chunks, generate embeddings, and store the results in PostgreSQL with pgvector.

Implementation is pending. No Lambda handler or application dependencies have been added.

## Python environment

From this directory, using Python 3.14:

```sh
python3.14 -m venv .venv
source .venv/bin/activate
```

The virtual environment is local and ignored by Git. Service dependencies will be recorded when implementation begins.
