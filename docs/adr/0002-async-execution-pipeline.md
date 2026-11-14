# 2. Asynchronous execution pipeline: outbox, SQS, fenced leases, quotas and snapshot streaming

- Status: Accepted. Implemented and tested locally; the AWS deployment is defined but not
  deployed.
- Date: 2026-11-02

## Context

Every AI request (tutor chat, attempt analysis, roadmap generation, catalog recommendation)
can take tens of seconds, may fail or time out, and costs money. The system has to:

- survive worker crashes and duplicate deliveries without double effects;
- cap each learner's daily token spend, including retries;
- stream progress to the browser and recover after a disconnect;
- keep Seymour from writing Core's data (separate PostgreSQL schemas and users; `make
  check-isolation` asserts that neither user can read the other's schema).

The return path from Seymour to Core also had to be chosen: HTTP callback or messaging.

## Decision

**Core owns admission and all persisted state.**

- **Execution row as a transactional outbox.** Admission commits the execution snapshot and
  its token reservation first, then publishes the execution id to the `papert-chat` SQS
  queue, and marks it published only after `SendMessage` succeeds. A scheduled sweep
  republishes unacknowledged rows. Duplicates are therefore expected and must be harmless.
- **Fenced leases.** A worker claims an execution through a Core control function and gets a
  60-second lease. Every later event carries the lease and an increasing event index; Core
  fences result effects from replaced leases; active checks refuse expired leases. A claim
  carries a fresh `claimId` UUID per worker invocation; transport retries (including Lambda
  SDK retries) resend that identity and recover the same live lease without another charge.
  Independent invocations use different claim identities. The decisions are pure functions
  (`claimDecision`, `failureDecision` in `apps/core/src/executions/domain/admission/lease.ts`).
- **Bounded retries.** At most three attempts per execution and a 15-minute admission
  deadline. A replayed terminal job never starts a fourth attempt. Unreported crashes are
  timed out by the sweep.
- **Quotas reserved before the call.** Each learner has a daily budget of 100,000 tokens
  (resetting at 00:00 UTC, also enforced by a database constraint) and a limit of 10 accepted
  requests per rolling minute. Admission reserves the budget of the attempts that still fit
  in the quota, under a per-user lock. The reservation becomes a conservative charge at claim
  and is settled once against the reported usage. A timed-out call stays charged because the
  provider may have billed it.
- **Results come back over a dedicated queue.** Seymour publishes progress and final results
  to `papert-results`, and a Core consumer validates and persists them. Each queue has its own
  dead-letter queue, visibility timeout and retry count.
- **Final delivery reuses the original lease.** Seymour stages the immutable final event
  before publishing it. If publication fails, it leaves the inference lease intact rather
  than reporting an inference failure. On redelivery it publishes the staged event before
  requesting any claim, preserving its original lease, event index and token usage. This
  transport-only replay needs no new reservation or attempt, even when only one attempt was
  affordable. Core settles the original known lease once, including duplicate final events.
  Lease expiry alone does not invalidate a queued final event: Core can complete it until
  the execution deadline if the lease has not been replaced. Cancellation, terminal state
  and replacement still fence result effects; late known usage can settle without
  publishing the answer. The staged store remains best effort and expires after one hour.
- **Snapshots, not deltas.** Core persists each accepted progress snapshot (cumulative text,
  execution id, monotonically increasing `sequence`) before delivering it. The browser
  replaces its text and ignores stale sequences, so reconnecting means fetching the latest
  snapshot over HTTP. In the AWS definition, Core also pushes snapshots through API Gateway
  WebSockets after re-checking session revocation and workspace ownership. The socket is
  opened with a 60-second, single-use ticket stored only as a hash.

Locally, a loopback-only runner reuses the production handlers and the Python worker. It
has an ephemeral, bearer-authenticated control bridge, Floci emulates SQS, and the Web client
falls back to HTTP snapshot polling because no WebSocket endpoint is configured.

## Alternatives considered

- **HTTP callback from Seymour to Core.** Simple and easy to trace, but it couples two
  async-first services at the moment a result is ready: a cold start, throttle or timeout
  loses the result unless Seymour retries inside its own time budget.
- **Reuse the chat queue with a message-type discriminator.** No new resource, but job
  dispatch and result delivery could no longer be tuned (concurrency, visibility, DLQ) or
  observed separately.
- **Seymour pushes directly to the browser.** Lower latency, but a model-side component would
  send text to a client without Core checking ownership, logout or ordering.
- **Token deltas instead of cumulative snapshots.** Smaller messages, but recovery after a
  missed frame needs a replay log. Snapshots make recovery a single read, at the cost of not
  keeping every partial frame.

## Consequences

- Effects are idempotent by construction (row locks, lease identity, event ordering,
  once-only usage settlement). PostgreSQL tests cover concurrent reservations, duplicate
  delivery and late text after cancellation (`apps/core/test/executions-*.e2e-spec.ts`).
  The cross-service replay test drives Seymour's real worker and wire adapters against Core
  and PostgreSQL, including a failed final send, claim-response loss, lease expiry, duplicate
  results and a quota allowing only one inference attempt.
- Conservative charging means an interrupted request can consume budget the learner did not
  "use". This is deliberate: it keeps the cap a true upper bound on spend.
- Two extra queues and DLQs to operate.
- The WebSocket path, IAM-signed control calls and Lambda packaging are defined in
  `serverless.yml` but only verified locally. Validating them on AWS is future work.
