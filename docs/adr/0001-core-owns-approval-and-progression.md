# 1. Core is the only authority over approval and progression

- Status: Accepted
- Date: 2026-11-02

## Context

Learners submit multi-file attempts for a roadmap step. Seymour, the AI tutor, reads the
attempt and judges it against the step's acceptance criteria. If the model's verdict were
written straight to the database, any of these would unlock a step the learner has not
earned:

- a hallucinated or prompt-injected "approved" (learner code and uploaded documents are
  untrusted text that ends up in the prompt);
- a correct verdict for a different attempt, an older revision or another step, delivered
  late or twice by an at-least-once queue;
- a structurally valid payload that silently drops a criterion.

The product also wants obvious syntax errors to be caught cheaply, without spending model
tokens on them.

## Decision

Core (NestJS) owns every official state change. Seymour only proposes an evaluation.

1. **Syntax filter before any model call.** Core parses the saved files in process before
   reserving quota: TypeScript/JavaScript (`typescript` syntactic diagnostics), Python
   (tree-sitter WASM), YAML, SQL (`libpg-query`, PostgreSQL grammar), JSON, and Dockerfiles
   (an in-house validator). Parsers only build trees; learner code is never executed. Files
   in other languages are reported as `unchecked` and the report states its coverage, so an
   unchecked file is never presented as valid. A syntax failure is recorded on the attempt
   and returns immediately: no execution, no quota, no model call.
2. **The evaluation is untrusted input.** `assessEvaluation`
   (`apps/core/src/executions/domain/analysis/evaluation.ts`) rejects a payload that targets another
   attempt, revision or step, or whose criterion set differs from the stored one.
3. **Approval is derived, not reported.** A step is approved only when every stored criterion
   is `met`. The model's prose is ignored.
4. **One transaction, at most one unlock.** The outcome is written in the same transaction
   that finishes the execution and settles token usage. Advancing `currentStep` is a
   conditional update on the attempt's step index, so redelivery or concurrent approvals
   unlock at most once. A revision that was already evaluated cannot be re-analyzed.
5. Invalid, missing, foreign or stale-lease results record `analysis_failed` and never
   progress. There is no client-writable path to progression.

## Alternatives considered

- **Let Seymour write progression.** Simplest, but it puts the trust boundary inside the
  component that processes untrusted text, and it would need write access to Core's schema
  (see the schema isolation in [0002](0002-async-execution-pipeline.md)).
- **Trust a `verdict` field from the model.** Rejected: a well-formed JSON verdict is not
  evidence. An extra `verdict` field actually invalidates the payload.
- **Run learner code in a sandbox to decide approval.** Stronger evidence, but a large
  security and operations surface (isolation, resource limits, per-language runtimes). Out
  of scope; the analysis is static and semantic by design.
- **Validate syntax in Seymour.** Would spend a queue round trip and cannot avoid the
  reservation. Core already holds the files.

## Consequences

- Approval quality still depends on the model's per-criterion judgement. That risk is
  managed by the labeled evaluation dataset, whose thresholds demand zero false accepts
  (see [0006](0006-ai-reliability-feedback-and-evals.md)). False rejects are tolerated up to
  a bound because a learner can retry; false accepts are not.
- Tree-sitter's Python grammar is more tolerant than CPython for some legacy forms, so a few
  syntax errors reach the model. Known limitation.
- The rollback behaviour is covered by a PostgreSQL test that injects a failure after the
  Study writes and checks that quota, execution and progression stay consistent
  (`apps/core/test/evaluation-transaction.e2e-spec.ts`).
