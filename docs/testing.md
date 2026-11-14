# Testing strategy

The approach: put the risky rules into pure functions and test them heavily, then prove the
transactional and concurrency guarantees against a real PostgreSQL rather than mocks.

## What exists

Counts measured on 2026-11-11 with local runs (no paid APIs; Core HTTP tests use a disposable PostgreSQL).

| App | Layer | Files | Cases executed | In CI |
| --- | --- | --- | --- | --- |
| Core | Unit (Vitest, `src/**/*.spec.ts`) | 76 | 532 | Yes |
| Core | HTTP + PostgreSQL (`test/*.e2e-spec.ts`) | 35 | 108 passed locally; 2 need an AWS endpoint | Yes, with Floci as the AWS endpoint |
| Web | Unit (`node --test`, `*.test.mjs`) | 47 | 217 | Yes |
| Web | Browser end-to-end (Playwright, `apps/web/e2e`) | 2 | 2; need the Docker stack | Yes, against the fake model |
| Seymour | Unit, including offline eval checks | 65 | 657 | Yes |
| Seymour | Integration (pgvector, DynamoDB) | 3 | need a database | Yes |
| Ingestion | Unit | 15 | 131 | Yes |
| Ingestion | Integration (vector store) | 1 | need a database | Yes |

Core statement coverage, measured locally with `npm run test:cov` (unit tests only):
about 99% in `domain/`, 81% in `application/`. Infrastructure is covered by the e2e suites,
which do not report coverage. CI uploads Core, Seymour, Ingestion and Web coverage reports as
build artifacts; no threshold is enforced yet.

## Highlights

- **Decisions as pure functions.** Lease claims, failure handling, event ordering, quota
  settlement and approval (`apps/core/src/executions/domain/**/*.spec.ts`) are tested without a
  database or clock.
- **Real concurrency tests.** PostgreSQL suites check concurrent quota reservations without
  overspending (`executions-quota.e2e-spec.ts`), concurrent saves without losing a revision
  (`study-workspace.e2e-spec.ts`), the atomic sign-in limiter (`auth.e2e-spec.ts`), concurrent
  votes (`community-catalog-votes.e2e-spec.ts`), and a rollback of usage, outcome and
  progression when a write fails mid-transaction (`evaluation-transaction.e2e-spec.ts`).
- **Authorization across users.** `study-isolation`, `executions-access`,
  `roadmap-drafts-access` and `execution-stream-authorization` suites check that one learner
  cannot reach another's resources.
- **Seymour with fake models.** The LangGraph workflows run against deterministic fake models.
  The worker wire format is pinned by a JSON fixture
  (`src/executions/application/contracts/test_transport.py`).
- **Edge-case inputs.** Multi-byte text, calendar boundaries for streaks, westward time-zone
  changes, and malformed, encrypted and scanned documents in ingestion.
- **The learning loop in a real browser.** Playwright drives the Docker stack: sign up, start a
  showcase roadmap from the community catalog, edit code in Monaco, wait for the autosave, ask
  Seymour, run an analysis that approves the step and unlocks the next, then reload and find
  everything in place (`apps/web/e2e/learner-journey.spec.ts`). A second spec signs a different
  learner in on the same browser and checks that the first learner's draft and workspace stay
  out of reach (`learner-isolation.spec.ts`). Selectors are roles and labels; waits are
  assertions, never sleeps.
- **Web state machines.** Autosave, analysis and catalog state are extracted into pure modules
  with unit tests (for example `app/study/workspace/save-state.test.mjs`).

## Fake model mode

Browser tests and the no-key demo set `MODEL_PROVIDER=fake`, which swaps Seymour's providers for a
deterministic model behind the same port (`apps/seymour/src/shared/infrastructure/fake_model.py`).
It answers every task: the tutor reads the step's criteria through a tool call and then answers,
roadmap drafts and conversation summaries pass the same validation as real ones, and token usage
is estimated from the request so budgets still apply. Its review rule is simple and visible: a
criterion is met once the files it names no longer contain the starter `TODO` marker. Every
answer says it comes from the demo model. Retrieval and catalog recommendations use a matching
fake embedder. Ingestion indexes sources with the same fake model id and vectors, so demo
queries can retrieve uploaded sources without a provider key.

The fake provider cannot be enabled by accident: any value other than `openai` or `fake` is an
error, `fake` is refused on AWS Lambda and in any stage other than `local`, `e2e` or `test`, the
API checks the setting at boot, and every selection logs
`fake_model_provider_enabled_answers_are_not_real` (Seymour) or
`fake_embedding_provider_enabled_vectors_are_not_real` (Ingestion).

## Shared contract fixtures

`contracts/` holds synthetic valid and invalid examples for the Core ↔ Seymour execution
jobs, worker events and control RPCs, plus Core ↔ Ingestion control RPCs and ingestion's
S3/SQS and reindex events. The suites exercise the real producers and consumers against the
same files; see [the contract inventory](../contracts/README.md) for each boundary.

From each service directory, run `npm test` in `apps/core`, and
`.venv/bin/python -m pytest -m unit` in both `apps/seymour` and `apps/ingestion`. All three
commands exercise the shared fixtures without a database or paid API. Web does not consume
these worker contracts.

Change order: add support and fixtures to consumers first, update producers next, then remove
the old field only after consumers have migrated and queued or in-flight messages have drained.
Keep examples for both supported forms during the transition, and run every affected service's
suite before shipping. Strict consumers must accept a new field before a producer sends it.

## AI quality gates

Model quality is measured separately from correctness tests, because it needs paid calls:

- `apps/seymour/evals/datasets/evaluation.json`: 50 labeled attempt evaluations, 15 in a holdout split,
  3 runs per configuration, with thresholds on the worst run (zero false accepts, false
  rejects at most 0.25, criterion accuracy at least 0.9).
- `evals/compare.py` blocks promotion of a prompt or model whose mean regresses beyond fixed
  tolerances.
- Tutor, generation, recommendation and memory datasets, plus prompt-injection and
  cross-workspace isolation fixtures for retrieval.
- Spend is capped per run (`evals/spend.py`).

Every CI run executes the offline checks of these datasets and of the threshold logic
(`python -m evals.ci --offline`). Pull requests that touch prompts, the evaluator or the eval
datasets also run a small paid subset capped at $0.25 (`.github/workflows/evaluations.yml`),
skipped when the model secrets are absent. The full suites are run manually. See [ADR 0006](adr/0006-ai-reliability-feedback-and-evals.md).

The paid workflow needs the `OPENAI_API_KEY`, `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY` and
`LANGFUSE_SECRET_KEY` repository secrets. Its cap applies to one workflow run, so set a budget
on the provider account as well.

## Running the tests

```sh
# Core
cd apps/core && npm ci && npm test
# Core HTTP + database tests: needs a migrated PostgreSQL and AUTH_TEST_DATABASE_URL
npm run test:e2e

# Web
cd apps/web && npm ci && npm test

# Browser end-to-end, from the repository root: builds and starts a disposable fake-model stack
# (Compose project papert-e2e, web on http://localhost:3100), runs Playwright, then removes it.
# Needs Docker and `npm ci && npx playwright install chromium` in apps/web.
# E2E_KEEP=1 keeps the stack; then `make e2e-test` reruns the tests and `make e2e-down` removes it.
make e2e

# Seymour and Ingestion (from each app folder)
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt   # Seymour
.venv/bin/pip install -r requirements-dev.txt   # Ingestion
.venv/bin/python -m pytest -m unit
```

## Known gaps

Listed honestly, roughly in the order they would be addressed:

1. **Thin browser coverage.** Two Playwright specs cover the main journey and cross-user
   isolation with the fake model. Autosave conflicts across tabs, session expiry and source
   uploads are not covered in the browser, and React components and hooks have no unit tests.
2. **Local skips.** Core e2e suites and the Python integration tests use `skipIf` when their
   database URL is missing, so a local run without one only covers unit tests. CI asserts the
   URLs and the AWS endpoint are set before running them, so a misconfigured pipeline fails
   instead of passing silently.
3. **No coverage thresholds and no property-based tests** for invariant-heavy code such as
   lease and quota transitions.
