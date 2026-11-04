"""OpenAI embeddings; SQS owns retries, so the SDK never retries on its own."""

import os

from openai import OpenAI

from src.domain.ports import Embedded

DIMENSIONS = 1536
BATCH_SIZE = 96


class OpenAIEmbeddings:
    def __init__(self, client=None, model=None):
        self.model = model or os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
        self.client = client or OpenAI(max_retries=0, timeout=30)

    def embed(self, texts):
        vectors = []
        tokens = 0

        for offset in range(0, len(texts), BATCH_SIZE):
            batch = texts[offset : offset + BATCH_SIZE]
            response = self.client.embeddings.create(
                model=self.model,
                input=batch,
                dimensions=DIMENSIONS,
                encoding_format="float",
            )

            ordered = sorted(response.data, key=lambda item: item.index)

            if len(ordered) != len(batch) or any(
                len(item.embedding) != DIMENSIONS for item in ordered
            ):
                raise RuntimeError("Embedding response does not match the request")

            vectors.extend(item.embedding for item in ordered)
            tokens += response.usage.prompt_tokens

        return Embedded(vectors, tokens, self.model)
