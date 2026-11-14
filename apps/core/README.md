# Core

**English** · [Português](README.pt-BR.md)

Papert's system of record: a NestJS API with Prisma and PostgreSQL (schema `core`). It owns
accounts, roadmaps, workspaces, attempts, approval, execution admission and quotas. It never
calls a model.

## Modules

| Module | Responsibility |
| --- | --- |
| `auth` | Argon2id passwords, JWE session cookies, sign-in rate limits ([ADR 0003](../../docs/adr/0003-authentication-jwe-sessions.md)) |
| `study` | Roadmaps, workspaces, autosaved files with revision checks, attempts, showcase roadmaps |
| `analysis` | In-process syntax filter run before any analysis is admitted |
| `executions` | Admission, quotas, fenced leases, result validation, snapshot streaming ([ADR 0001](../../docs/adr/0001-core-owns-approval-and-progression.md), [ADR 0002](../../docs/adr/0002-async-execution-pipeline.md)) |
| `sources` | Upload registration, ingestion control, citation viewer links ([ADR 0005](../../docs/adr/0005-upload-ingestion-and-scoped-retrieval.md)) |
| `memory` | Tutor conversations, session summaries and learner-controlled durable memory |
| `community` | Published roadmap catalog, search, votes and favorites |
| `engagement` | Study streaks and roadmap achievements |
| `feedback` | Answer ratings and hallucination reports, delivered to Langfuse |
| `health` | Readiness probe: `GET /health` answers 503 when the database is unreachable |

## Structure

```
src/
  main.ts              HTTP server entry point (containers)
  lambda.ts            HTTP entry point behind API Gateway
  lambda-context.ts    Nest context shared by the non-HTTP Lambda handlers
  http.ts              HTTP hardening shared by both entry points
  app.module.ts        composition root
  common/              domain primitives, validation, database and HTTP adapters shared by modules
  <module>/
    domain/            rules and value types; ports/ declares what the module needs
    application/       use cases, input contracts and response mapping
    infrastructure/    controllers, Prisma and AWS adapters, lambda-handlers.ts, local-worker.ts
    <module>.module.ts wiring
```

Dependencies point inwards: `infrastructure/` → `application/` → `domain/`
([ADR 0004](../../docs/adr/0004-hexagonal-boundaries-and-accepted-exceptions.md)).
`src/architecture.spec.ts` fails the build when an import crosses those boundaries.

Every deployed function is declared in `serverless.yml`. The control functions that workers
call have no HTTP route; locally, the `local-worker.ts` runners reach them through a
loopback-only bridge.

## Development

To run the whole stack, see the [project README](../../README.md#quick-start).

```sh
npm ci
npm test            # unit tests (Vitest)
npm run lint
npm run test:e2e    # HTTP + PostgreSQL; needs a migrated database and AUTH_TEST_DATABASE_URL
```

More in the [testing guide](../../docs/testing.md).
