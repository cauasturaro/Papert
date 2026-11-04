"""Send correlation and numeric measurements, never learner content or credentials."""

import os
from contextlib import contextmanager

from langfuse import Langfuse, propagate_attributes
from langsmith import tracing_context

from src.tutor.application.tools import TOOL_ARGUMENTS
from src.tutor.infrastructure.openai_model import MODEL_PRICES


def mask(data, **_kwargs):
    if isinstance(data, int | float | bool) or data is None:
        return data
    if isinstance(data, dict):
        return {key: mask(value) for key, value in data.items()}
    if isinstance(data, list):
        return [mask(value) for value in data]

    return "[redacted]"


class ExecutionMeasurements:
    def __init__(self, observation):
        self._observation = observation

    def record_metadata(self, metadata: dict[str, int | str]) -> None:
        self._observation.update(metadata=metadata)


class TutorTrace:
    def __init__(self):
        self.client = Langfuse(
            base_url=os.environ["LANGFUSE_BASE_URL"],
            public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
            secret_key=os.environ["LANGFUSE_SECRET_KEY"],
            mask=mask,
            timeout=3,
        )

    @contextmanager
    def execution(self, execution_id, session_id, name="seymour-tutor"):
        trace_id = self.client.create_trace_id(seed=execution_id)
        try:
            with (
                tracing_context(enabled=False),
                self.client.start_as_current_observation(
                    name=name, as_type="agent", trace_context={"trace_id": trace_id}
                ) as span,
                propagate_attributes(
                    session_id=session_id, metadata={"execution_id": execution_id}
                ),
            ):
                try:
                    yield ExecutionMeasurements(span)
                except Exception:
                    raise RuntimeError("Tutor invocation failed") from None
        finally:
            self.client.flush()

    @contextmanager
    def generation(self, model, effort, input_bound, max_output):
        with self.client.start_as_current_observation(
            name="openai-generation",
            as_type="generation",
            model=model,
            model_parameters={"reasoning_effort": effort, "max_output_tokens": max_output},
            metadata={
                "input_token_count": input_bound,
                "cost_known": model in MODEL_PRICES,
            },
        ) as generation:
            yield generation

    def tool(self, name, action):
        safe_name = name if name in TOOL_ARGUMENTS else "unknown-tool"
        with self.client.start_as_current_observation(name=safe_name, as_type="tool") as span:
            result = action()
            span.update(metadata={"error": result.kind == "error"})

        return result
