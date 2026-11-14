# 6. AI reliability: bounded fallback, prompt versions, learner feedback and gated evals

- Status: Accepted. Implemented locally; evals are run manually, not in CI.
- Date: 2026-11-06

## Context

Seymour calls an LLM for tutoring, attempt evaluation, roadmap generation and conversation
summaries. Four questions needed concrete answers:

1. What happens when the provider times out, rate-limits or returns 5xx, without blowing the
   per-learner token budget from [0002](0002-async-execution-pipeline.md)?
2. When answer quality changes, which prompt produced which answer?
3. How do learners report bad answers, and how do those reports become regression tests?
4. How is a prompt or model change prevented from making evaluation worse, especially from
   approving work that should fail ([0001](0001-core-owns-approval-and-progression.md))?

## Decision

**Bounded fallback, as a pure policy.** `next_step` in
`apps/seymour/src/shared/domain/fallback.py` decides retry, switch or fail:

- one retry on the same provider for 429/5xx, only when `Retry-After` is at most 2 s and at
  least 4 s remain;
- a timeout is never retried in place;
- then one switch to the fallback provider if at least 4 s remain;
- while a fallback exists, the current provider gets 60% of the remaining deadline.

The fallback (DeepSeek, OpenAI-compatible) is optional and active only when its key is set.
After a switch, the rest of that execution stays on the fallback, so one answer never mixes
provider-specific state. Any other error (400, authentication) is a request error and never
switches.

**Budget-aware calls.** Before each OpenAI call the adapter counts input tokens exactly with
the provider's counting endpoint and fits the output reservation to what is left of the
attempt budget. A timed-out call is charged its full reservation, because the provider may
have billed it. DeepSeek has no counting endpoint, so its admission uses a conservative
estimate. Total failure is an explicit terminal state that Core records as `failed`, and an
analysis that fails can never approve.

**Prompt identity.** Each model task declares a prompt family (`tutor.guidance`,
`evaluation.attempt`, `roadmap.draft`, `conversation.summary`, `judge.feedback`). Its version
is `sha:` plus the first 12 hex digits of a SHA-256 over the static templates, including the
tutor's render layout, so reordering a prompt also changes its version. Every Langfuse
generation records the prompt, its version, provider and model. Git is the source of truth;
Langfuse prompt management is not used.

**Learner feedback.** Core's `feedback` module stores thumbs up/down and hallucination reports
on finished chat and analysis executions the learner owns. Each change is stored first, then
sent to Langfuse as scores on that execution's trace, both immediately and by a sweep that
claims rows with `FOR UPDATE SKIP LOCKED` and backs off exponentially. A reported answer
becomes an eval case only after a person removes personal data and marks it treated;
`evals/run_reported.py` refuses untreated cases.

**Evals gate changes.** `apps/seymour/evals/datasets/evaluation.json` holds 50 labeled attempt
evaluations (per-criterion edge cases, cross-file and prompt-injection cases). 15 of them are
a holdout split never used to tune prompts. Each configuration runs 3 times, and the
thresholds apply to the *worst* run:

| Metric | Threshold |
| --- | --- |
| False accept rate | 0.0 |
| False reject rate | at most 0.25 |
| Cross-file rejections | 1.0 |
| Criterion accuracy | at least 0.9 |

Promoting a candidate prompt or model (`evals/compare.py`) also blocks any mean regression
beyond fixed tolerances against the baseline. Every eval call is metered against a spend cap
(`evals/spend.py`). A feedback-quality judge is calibrated against human-reviewed labels with
Cohen's kappa, and it gates nothing until that agreement is recorded.

**Prompt caching** is enabled (`prompt_cache_key` per task) and measured, but prompts are not
padded to reach the provider's caching floor. During development, cache reads appeared only
above roughly 1,800 identical prefix tokens, which most Papert requests do not reach.

## Alternatives considered

- **Unbounded retries or SDK-level retries.** Simple, but they hide cost and blow the
  execution deadline. SDK retries are disabled; the policy above and SQS own retries.
- **A second model on the same provider.** Does not help when the provider itself is down.
- **Langfuse Dataset Runs and prompt management.** They would move the source of truth out of
  Git and need their own experiment runner. Versioned JSON datasets in Git, with scores
  written to Langfuse traces, were enough.
- **Evaluate on a single run.** LLM output varies; a single passing run is not evidence. The
  worst of three runs is a cheap, stricter bar.
- **Free-text feedback.** More signal, but it collects personal data and needs moderation.
  Not collected.

## Consequences

- Evals make paid model calls and are run manually. CI runs only their offline checks
  (dataset shape and threshold logic in `evals/tests/`). Wiring the gate into a
  scheduled or manual CI job is future work.
- Switching to the fallback provider is covered by unit tests only; it has not been exercised
  against a live DeepSeek endpoint in this repository.
- Learner reports need a human treatment step before they become tests. That is deliberate.
