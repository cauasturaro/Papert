"""Send correlation and numeric measurements, never learner content or credentials."""

import os
import re
from contextlib import contextmanager

from langfuse import Langfuse, propagate_attributes
from langsmith import tracing_context

from src.shared.infrastructure.generation import (
    MODEL_PRICES,
    GenerationCall,
    GenerationUsage,
    cost_details,
)

# Opaque identifiers and our own enum values are safe; any other string may be learner content.
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
PROMPT_VERSION = re.compile(r"^sha:[0-9a-f]{12}$")
SAFE_VALUES = {
    "cited",
    "unsupported",
    # Generation and analysis stop reasons.
    "generated",
    "evaluated",
    "invalid",
    "budget",
    "deadline",
    "cancelled",
    "unavailable",
    # Providers, fallback reasons and actions.
    "openai",
    "deepseek",
    "timeout",
    "rate_limited",
    "server_error",
    "retry",
    "switch",
    "fail",
    # Error classes recorded on failed generations.
    "ModelUnavailable",
    "BudgetExceeded",
    "TutorCancelled",
    "TimeoutError",
    "RuntimeError",
    # Prompt families.
    "tutor.guidance",
    "conversation.summary",
    "evaluation.attempt",
    "roadmap.draft",
    "judge.feedback",
}


def mask(data, **_kwargs):
    if isinstance(data, int | float | bool) or data is None:
        return data
    if isinstance(data, str) and (
        UUID.match(data) or PROMPT_VERSION.match(data) or data in SAFE_VALUES
    ):
        return data
    if isinstance(data, dict):
        return {key: mask(value) for key, value in data.items()}
    if isinstance(data, list):
        return [mask(value) for value in data]

    return "[redacted]"


class GenerationMeasurements:
    def __init__(self, observation, model: str):
        self._observation = observation
        self._model = model

    def usage(self, usage: GenerationUsage) -> None:
        self._observation.update(
            usage_details={
                "input": usage.input,
                "output": usage.output,
                "total": usage.input + usage.output,
                "cache_read_input_tokens": usage.cached,
            }
        )

        cost = cost_details(self._model, usage)
        if cost is not None:
            self._observation.update(cost_details=cost)


class ExecutionMeasurements:
    def __init__(self, observation):
        self._observation = observation

    def record_metadata(self, metadata: dict) -> None:
        self._observation.update(metadata=metadata)


class ExecutionTrace:
    def __init__(self, tool_names=()):
        self.tool_names = frozenset(tool_names)

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
    def generation(self, call: GenerationCall):
        # The trace tag lets Langfuse filter whole executions by prompt version.
        with (
            propagate_attributes(tags=[f"{call.prompt}@{call.prompt_version}"]),
            self.client.start_as_current_observation(
                name=f"{call.provider}-generation",
                as_type="generation",
                model=call.model,
                version=call.prompt_version,
                model_parameters={
                    "reasoning_effort": call.effort,
                    "max_output_tokens": call.max_output,
                },
                metadata={
                    "provider": call.provider,
                    "prompt": call.prompt,
                    "prompt_version": call.prompt_version,
                    "input_token_count": call.input_tokens,
                    "input_count_exact": call.input_exact,
                    "cost_known": call.model in MODEL_PRICES,
                },
            ) as generation,
        ):
            try:
                yield GenerationMeasurements(generation, call.model)
            except Exception as error:
                # Only the error class reaches the trace; provider messages may echo input.
                generation.update(
                    level="ERROR",
                    metadata={"error": type(error).__name__, "reason": _reason(error)},
                )
                raise

    def fallback(self, event: dict) -> None:
        """A provider failed: which one, why, and whether the call was retried or switched."""
        with self.client.start_as_current_observation(
            name="model-fallback",
            as_type="span",
            level="WARNING",
            metadata=event,
        ):
            pass

    def retrieval(self, action):
        """Records which passages were used (ids, ordinals, distances, sizes), never their text."""
        with self.client.start_as_current_observation(
            name="source-retrieval", as_type="retriever"
        ) as span:
            passages, tokens = action()
            span.update(metadata=retrieval_metadata(passages, tokens))

        return passages, tokens

    def tool(self, name, action):
        safe_name = name if name in self.tool_names else "unknown-tool"
        with self.client.start_as_current_observation(name=safe_name, as_type="tool") as span:
            result = action()
            span.update(metadata={"error": result.kind == "error"})

        return result


def _reason(error: Exception):
    return getattr(error, "reason", None)


def retrieval_metadata(passages, tokens):
    used = [
        {
            "documentId": passage["documentId"],
            "ordinal": passage["ordinal"],
            "distance": passage["distance"],
            "characters": len(passage["content"]),
            # Headings are learner text; numeric locations are enough to find the passage.
            "location": {
                key: value for key, value in passage["location"].items() if isinstance(value, int)
            },
        }
        for passage in passages
    ]

    return {"embeddingTokens": tokens, "passages": used}
