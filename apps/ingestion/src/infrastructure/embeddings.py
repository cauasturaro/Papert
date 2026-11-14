"""OpenAI embeddings; SQS owns retries, so the SDK never retries on its own."""

import os
import time

from openai import OpenAI

from src.domain.index_format import DIMENSIONS as DIMENSIONS
from src.domain.ports import Embedded

BATCH_SIZE = 96


class OpenAIEmbeddings:
    def __init__(self, client=None, model=None, deadline=None):
        self.deadline = deadline
        self.model = model or os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
        self.client = client or OpenAI(max_retries=0, timeout=30)

    def embed(self, texts):
        vectors = []
        tokens = 0

        for offset in range(0, len(texts), BATCH_SIZE):
            timeout = 30
            if self.deadline is not None:
                timeout = min(timeout, self.deadline - time.monotonic())
            if timeout <= 0:
                raise TimeoutError("Invocation budget exhausted before embedding")

            batch = texts[offset : offset + BATCH_SIZE]
            response = self.client.embeddings.create(
                timeout=timeout,
                model=self.model,
                input=batch,
                dimensions=DIMENSIONS,
                encoding_format="float",
            )

            ordered = sorted(response.data, key=lambda item: item.index)

            if len(ordered) != len(batch) or any(
                type(item.index) is not int
                or item.index != index
                or len(item.embedding) != DIMENSIONS
                for index, item in enumerate(ordered)
            ):
                raise RuntimeError("Embedding response does not match the request")

            vectors.extend(item.embedding for item in ordered)
            used = response.usage.prompt_tokens
            total = response.usage.total_tokens
            if type(used) is not int or used < 0 or type(total) is not int or total != used:
                raise RuntimeError("Invalid embedding usage")

            tokens += used

        return Embedded(vectors, tokens, self.model)
