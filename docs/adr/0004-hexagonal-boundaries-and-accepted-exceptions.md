# 4. Hexagonal boundaries, with three accepted inner-layer libraries

- Status: Accepted
- Date: 2026-11-03

## Context

Core (NestJS + Prisma), Seymour (FastAPI + LangGraph) and the ingestion worker (Python
Lambda) all follow a ports-and-adapters layout:

```
<module>/
  domain/          rules and value types; domain/ports/ declares what the module needs
  application/     use cases that orchestrate domain rules through ports
  infrastructure/  adapters (Prisma, AWS SDK, OpenAI, HTTP controllers) and module wiring
```

An internal review of the layering found real violations: a health check calling the ORM
directly, execution policy embedded in the Prisma adapter, streaming with no application
service, the Seymour worker acting as both orchestrator and composition root, LangChain
message types crossing the model port, AWS wire formats parsed in the ingestion application
layer, and document-parsing libraries in the ingestion domain. The review also found library
imports whose removal would cost more than it would protect.

A rule that is enforced selectively is worse than a written exception, so the boundary had
to be stated precisely.

## Decision

- Persistence, transport formats, cloud SDKs, model providers and file-parsing libraries
  stay out of `domain/` and `application/`.
- A module reaches another module only through its own port or that module's explicit
  public service. Adapters are constructed only in composition roots: Nest `*.module.ts`
  files, and the infrastructure factories in Seymour and ingestion.
- Three libraries are explicitly accepted in inner layers:
  - **Zod (Core):** schemas define validated input types through `z.infer`. Zod is pure
    validation with no I/O, and moving every schema outward would duplicate every type.
  - **Pydantic (Seymour):** same reasoning, for domain snapshots and evaluation models.
  - **LangGraph (Seymour application layer only):** `StateGraph` *is* the tutor, evaluation
    and roadmap-generation workflow, and it runs against fake models in unit tests.
    LangChain message classes and provider metadata must not cross the model port. Adapters
    translate them to application-owned request and response types.
- Storage concepts in Core's Sources ports (bucket, key, presigned URL, object version) are
  accepted because the upload protocol itself is defined in those terms (see
  [0005](0005-upload-ingestion-and-scoped-retrieval.md)).

The violations listed above were fixed rather than accepted.

## Alternatives considered

- **Strict purity everywhere.** Hand-written validators or mapping layers for every Zod and
  Pydantic schema, and a home-grown graph runner instead of LangGraph. More code, more drift,
  little protection: none of these libraries does I/O.
- **Framework-first layout (Nest services that call Prisma directly).** Faster to write, but
  the most important rules (lease decisions, quota settlement, approval) would only be
  testable against a database.
- **No written rule.** Exceptions accumulate silently and the layering stops meaning
  anything.

## Consequences

- Domain rules are plain functions with near-complete unit coverage (about 99% of
  statements in Core's domain layer, measured locally). Infrastructure is exercised by HTTP
  and PostgreSQL tests (see [testing](../testing.md)).
- Replacing Zod, Pydantic or LangGraph would mean touching inner layers. That cost is
  accepted.
- Any other framework, SDK or I/O import in `domain/` or `application/` is a violation, and
  the unit suites fail on one. Each service has an architecture test that parses its own
  imports: `apps/core/src/architecture.spec.ts`, `apps/seymour/src/test_architecture.py` and
  `apps/ingestion/src/test_architecture.py`. Core's test also rejects an adapter of one
  module imported by another outside a composition root.
