# Seymour

Papert's AI tutor, built with FastAPI, LangChain and LangGraph.

- Receives tutor jobs with context authorized by Core.
- Uses read-only tools to inspect saved code, structure, criteria and test evidence.
- Calls OpenAI through ChatOpenAI and returns structured guidance.
- Reports token usage, costs and timing to the self-hosted Langfuse service.

The execution worker runs tutor jobs; the API exposes health and an internal execution endpoint.

See the [project README](../../README.md) for setup and startup commands.
