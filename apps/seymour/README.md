# Seymour

**English** · [Português](README.pt-BR.md)

Papert's AI tutor: FastAPI, LangGraph and the OpenAI API, with Langfuse tracing. Seymour
proposes. It never writes learner progression and cannot read Core's schema.

Jobs arrive from the chat queue. The worker claims each one from Core under a fenced lease
and publishes progress and results to the results queue
([ADR 0002](../../docs/adr/0002-async-execution-pipeline.md)).

## Workflows

| Module | What it does |
| --- | --- |
| `tutor/` | LangGraph loop between the model and read-only tools (`read_code`, `read_structure`, `read_criteria`, `read_test_evidence`, `search_sources`). It ends with an answer, or fails explicitly when the token budget or deadline runs out |
| `evaluation/` | Maps the files, then evaluates them in at most two model calls. Returns a per-criterion result that Core validates ([ADR 0001](../../docs/adr/0001-core-owns-approval-and-progression.md)) |
| `roadmap/` | Drafts a roadmap from the learner's goal |
| `recommendation/` | Embedding similarity over the community catalog |
| `retrieval/` | pgvector search scoped to the sources Core still reports as ready ([ADR 0005](../../docs/adr/0005-upload-ingestion-and-scoped-retrieval.md)) |
| `shared/` | Model port, bounded fallback policy, content-hashed prompt versions and the Langfuse tracer ([ADR 0006](../../docs/adr/0006-ai-reliability-feedback-and-evals.md)) |

## Development

To run the whole stack, see the [project README](../../README.md#quick-start).

```sh
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m ruff check .
.venv/bin/pyright
.venv/bin/python -m pytest -m unit
```

Unit tests live beside the code in `src/`. Integration tests (`-m integration`) live in
`tests/` and need `SEYMOUR_TEST_DATABASE_URL` pointing at a database with pgvector and the
Alembic migrations applied.

## Evals

```sh
.venv/bin/python -m evals.ci --offline    # free: dataset and grader checks
.venv/bin/python -m evals.ci              # paid: small tutor and pedagogy subset
```

Every other suite under `evals/` makes **paid** model calls and exits 1 when it misses its
thresholds. Spend is capped by `EVAL_SPEND_CAP_USD` (0.25 by default).

| Suite | Measures |
| --- | --- |
| `evals.run_evaluation` | Evaluation verdicts against labeled attempts; `evals.compare` blocks a candidate that regresses |
| `evals.run_tutor` | Tutor modes, tools and adversarial prompts |
| `evals.run_pedagogy` | Whether the tutor hands over the solution under pressure |
| `evals.run_memory`, `evals.run_judge`, `evals.run_generation`, `evals.run_recommendation` | Memory, the feedback judge, roadmap generation and recommendations |

Thresholds and gates are in the [testing guide](../../docs/testing.md#ai-quality-gates).
