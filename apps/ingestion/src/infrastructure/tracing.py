"""Usage-only embedding traces: identifiers and numbers, never document text."""

import os
from contextlib import contextmanager, nullcontext

PRICE_PER_MILLION = {"text-embedding-3-small": 0.02}


def _mask(data, **_kwargs):
    if isinstance(data, int | float | bool) or data is None:
        return data

    if isinstance(data, dict):
        return {key: _mask(value) for key, value in data.items()}

    if isinstance(data, list):
        return [_mask(value) for value in data]

    return "[redacted]"


class IngestionTrace:
    def __init__(self):
        self.client = None

        if os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY"):
            from langfuse import Langfuse

            self.client = Langfuse(
                base_url=os.environ.get("LANGFUSE_BASE_URL"),
                public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
                secret_key=os.environ["LANGFUSE_SECRET_KEY"],
                mask=_mask,
                timeout=3,
            )

    @contextmanager
    def document(self, document_id, version_id, metadata):
        if self.client is None:
            yield None
            return

        trace_id = self.client.create_trace_id(seed=f"{document_id}:{version_id}")

        try:
            with self.client.start_as_current_observation(
                name="source-ingestion",
                as_type="span",
                trace_context={"trace_id": trace_id},
                metadata={"document_id": document_id, **metadata},
            ) as span:
                yield span
        finally:
            self.client.flush()

    def embedding(self, model, inputs):
        if self.client is None:
            return nullcontext(None)

        return self.client.start_as_current_observation(
            name="openai-embedding",
            as_type="embedding",
            model=model,
            metadata={"inputs": inputs},
        )

    @staticmethod
    def record_usage(observation, model, tokens):
        if observation is None:
            return

        observation.update(usage_details={"input": tokens})

        if model in PRICE_PER_MILLION:
            observation.update(
                cost_details={"input": tokens * PRICE_PER_MILLION[model] / 1_000_000}
            )
