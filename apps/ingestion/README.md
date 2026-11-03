# Ingestion

The planned document-processing worker for Papert's source search.

It will receive upload events through SQS, extract text, split it into chunks,
generate embeddings and store searchable content in PostgreSQL with pgvector.

Only the Serverless configuration exists. The worker is not implemented and has no startup command yet.

See the [project README](../../README.md) for the services available today.
