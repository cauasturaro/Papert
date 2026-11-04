# Seymour

Papert's AI tutor, built with FastAPI, LangChain and LangGraph.

- Receives tutor jobs with context authorized by Core.
- Uses read-only tools to inspect saved code, structure, criteria and test evidence.
- Calls OpenAI through ChatOpenAI and returns structured guidance.
- Evaluates saved multi-file attempts against the step criteria; Core decides approval.
- Reports token usage, costs and timing to the self-hosted Langfuse service.

The execution worker runs tutor and analysis jobs; the API exposes health and an internal execution endpoint.

Evaluation quality is measured on a labeled dataset with `.venv/bin/python -m evals.run_evaluation`, which makes paid model requests and fails when the thresholds in `evals/evaluation.json` are not met.

Unit tests live beside their owners in `src/`; offline dataset checks live in `evals/`.
Run `.venv/bin/python -m pytest -m unit` from this folder. Database integration tests
remain in `tests/` and use `-m integration`; test data files live in `tests/fixtures/`.
Set `SEYMOUR_TEST_DATABASE_URL` to a test database with pgvector enabled and the Seymour
Alembic migrations applied.

See the [project README](../../README.md) for setup and startup commands.
