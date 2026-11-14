# Moss library retrieval notes

## Scope and ownership

Our FastAPI application searches a small internal library using PostgreSQL and pgvector. Learners should separate ingestion, retrieval, and response formatting into distinct modules. Keep provider calls behind explicit interfaces so the retrieval policy can be reviewed with fixed vectors and documents. No provider credentials belong in examples or fixtures.

Each stored chunk has document identity, chunk text, an embedding, and a visibility label. The visibility label uses the field `moss_access_band`. The search request carries the caller's allowed bands; filtering belongs inside the database query before selecting the nearest matches. Removing unauthorized results after ranking can hide relevant authorized results and is not our convention.

## Retrieval policy

The team calls its retrieval policy `fern-window-6`: fetch up to six authorized chunks and preserve their document identifiers in the response context. This name is a policy label, not a pgvector operator. Explain the difference between similarity ordering and authorization when introducing the query.

Generated answers cite evidence using `moss_document_key`. This key remains stable when a document is rechunked. Keep it distinct from an individual chunk identifier and from a database row number.

## Review handoff

Include a schema file, repository query, request model, and response mapping. Reviewers should be able to trace the access-band filter, vector distance ordering, and document-key propagation by reading those files. Test source should demonstrate empty matches and unauthorized bands without requiring a live database during review.
