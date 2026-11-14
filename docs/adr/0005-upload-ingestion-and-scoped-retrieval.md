# 5. Direct-to-storage uploads, event-driven ingestion and workspace-scoped retrieval

- Status: Accepted. Implemented and tested locally against Floci (emulated S3 and SQS).
- Date: 2026-11-03

## Context

Learners attach their own PDF, DOC, DOCX and Markdown documents to a workspace, and the tutor
answers from them with citations the learner can open. Constraints:

- Core authorizes and owns document state, but must not proxy large file bodies.
- Vectors live in Seymour's schema. Core and Seymour have separate database users that
  cannot read each other's schema.
- Uploaded documents are untrusted. They can be malformed, oversized, scanned, encrypted, or
  carry prompt injection.
- Retrieval must never leak another learner's documents, and deleting a source must stop its
  use, even while a request is running.
- S3 delivers events at least once and possibly out of order.

## Decision

**Register before the bytes exist.** The browser registers a file (name, content type, size)
with Core. Core checks workspace ownership, the extension against the content type, and the
limits (15 MiB per file, 20 sources per workspace, 30 registrations per learner per day). It
then records the document as `awaiting_upload` and returns a 10-minute presigned `PUT` URL
whose signature covers `Content-Type` and `Content-Length`. The browser uploads straight to
S3; Core never receives the file.

**S3 drives ingestion.** `ObjectCreated` and `ObjectRemoved` notifications go to the
`papert-ingestion` queue (three receives, then a DLQ). The Python worker asks Core, through a
control function with no HTTP route, whether to process that exact object version. Core
rejects unknown keys, size mismatches, stale S3 sequencers and deleted documents.

**Extraction is strict and honest.** Content sniffing must agree with the declared format.
PDF uses `pypdf` (page locations), DOCX uses `python-docx` (paragraph and heading locations),
legacy DOC is read with `olefile` and the Word piece table, and Markdown is strict UTF-8 with
line ranges. Scanned PDFs fail with `no_text`; nothing is invented and there is no OCR.
Learner-file problems are permanent failures with a stable error code. Infrastructure
failures are raised so SQS retries them.

**Chunks and vectors.** Paragraph-aware chunks of about 1,600 characters with about 200
characters of overlap. Chunks never cross a PDF page, so every chunk has exactly one
location. Embeddings use `text-embedding-3-small` (1,536 dimensions) and are stored in
PostgreSQL with pgvector. All of a document's chunks are replaced in one transaction that
locks the document row. A tombstone and the stored sequencer stop duplicate or late writes.

**Retrieval is scoped by Core, every time.** An execution snapshot contains only the
workspace's `ready` sources. Before every search, Seymour asks Core which of those are
*still* ready under the current lease. The SQL filters by workspace and document ids, so a
deleted source is never searched again. Grounding runs before the first model call: it is not
left to the model's discretion, because an earlier prompt-only "use the tool when relevant"
policy was ignored in practice. It keeps up to three passages under a cosine distance of
0.72; mentioned sources are always used.

**Citations are data, not prose.** Only excerpts retrieved in that run can be cited, and
invented citations are dropped. Quotations are copied by the server from the retrieved text
between the lines the model points at, so a quote cannot be fabricated. Core re-authorizes
the citations against currently ready sources before storing them. When no excerpt supports
the answer, the UI says so. The viewer opens version-pinned, short-lived presigned links:
PDF.js for PDFs, numbered lines for Markdown, and a text rendition produced by ingestion for
DOC and DOCX.

## Alternatives considered

- **Upload through Core.** Simpler authorization, but every file body would pass through an
  API process (memory, Lambda payload limits, timeouts).
- **Core publishes the ingestion job after upload.** Needs a second client call, and the
  object may not exist yet. S3 events are the ground truth for "bytes exist".
- **A dedicated vector database.** Unnecessary at this scale. pgvector keeps vectors
  transactional with their document rows and inside the same schema-isolation model.
- **Model-driven retrieval only (tool calling).** Tried first; the model skipped the tool
  too often. The `search_sources` tool remains for deeper follow-up lookups.
- **Let the model retype quotations.** Tried first; quotes were altered or rejected too
  often. Server copying cannot invent text.

## Consequences

- Embedding cost is bounded by per-file, per-workspace and per-day limits rather than the
  execution token quota. Revisit if usage grows.
- A redelivery between writing vectors and confirming to Core re-embeds once. Rare, accepted.
- Text the model already wrote from an excerpt stays in that answer when the source is deleted
  mid-run. Its citation and quote are still removed.
- Floci does not enforce signed upload headers. Locally, size tampering is caught by Core's
  version check and format tampering by content sniffing. Real S3 enforcement is unverified
  until an AWS deployment.
- The cross-workspace search and ingestion idempotency tests need a pgvector database and do
  not run in CI yet (see [testing](../testing.md)).
- Uploaded documents are a prompt-injection vector. Prompts frame excerpts as untrusted data,
  tools are read-only, and the evaluation suite includes injection and isolation fixtures.
  This mitigates the risk; it does not eliminate it.
