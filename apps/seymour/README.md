# Seymour

Papert's AI tutor, built with FastAPI, LangChain and LangGraph.

- Receives tutor jobs with context authorized by Core.
- Uses read-only tools to inspect saved code, structure, criteria and test evidence.
- Calls OpenAI through ChatOpenAI and returns structured guidance.
- Evaluates saved multi-file attempts against the step criteria; Core decides approval.
- Reports token usage, costs and timing to the self-hosted Langfuse service.

The execution worker runs tutor and analysis jobs; the API exposes health and an internal execution endpoint.

Evaluation quality is measured on a labeled dataset with `.venv/bin/python -m evals.run_evaluation`, which makes paid model requests and fails when the thresholds in `evals/evaluation.json` are not met.

See the [project README](../../README.md) for setup and startup commands.
