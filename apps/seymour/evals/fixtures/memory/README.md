# Tutor memory evaluation fixtures

All three datasets share the exact first step of the default Papert HTTP service roadmap.
Source: `apps/core/src/study/domain/default-roadmap.ts`, step `validate-input`.
`proposals.json` has 24 decisions: 8 lasting preferences, 6 recurring difficulties, and 10 negatives.
Negatives contrast temporary requests with durable preferences and include injection, a fake key, and code storage.
`preference_use.json` has 6 active-memory cases and 2 matched controls without memory.
Its regex checks measure observable answer signals; incidental matches are possible, so compare control hit rates.
`long_conversation.json` has 14 guided exchanges and 3 probes for current work, pending actions, and struggle.
Three concrete pending actions occur only in turns 1–8; turns 9–14 discuss adjacent HTTP topics.
Cases use English, synthetic learner data, and hints with checking questions rather than full solutions.
`evals/test_memory_fixtures.py` validates contracts offline; it does not measure model quality or run compaction.
