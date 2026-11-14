# Architecture decision records

Each record states the context, the decision, the alternatives that were rejected and the
consequences, including what is not yet implemented.

| # | Decision | Main trade-off |
| --- | --- | --- |
| [0001](0001-core-owns-approval-and-progression.md) | Core, not the model, approves attempts and unlocks steps | Safety over latency: a model verdict is input, never state |
| [0002](0002-async-execution-pipeline.md) | Outbox + SQS + fenced leases + reserved quotas + snapshot streaming | Two extra queues and conservative charging, in exchange for idempotent effects and a hard spend cap |
| [0003](0003-authentication-jwe-sessions.md) | Short-lived JWE cookies backed by a revocable server-side session | One session lookup per request, in exchange for instant revocation and key rotation |
| [0004](0004-hexagonal-boundaries-and-accepted-exceptions.md) | Ports and adapters, with Zod, Pydantic and LangGraph accepted in inner layers | Pragmatic purity: written exceptions instead of duplicated types |
| [0005](0005-upload-ingestion-and-scoped-retrieval.md) | Direct-to-S3 uploads, event-driven ingestion, pgvector retrieval re-authorized by Core | More moving parts than a synchronous upload, but no file bodies through the API and no cross-workspace reads |
| [0006](0006-ai-reliability-feedback-and-evals.md) | Bounded provider fallback, hashed prompt versions, learner feedback and worst-run eval gates | Evals cost money and run manually; zero false accepts is a hard bar |
