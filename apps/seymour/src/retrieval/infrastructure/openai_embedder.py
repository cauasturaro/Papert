"""Query embeddings; must use the same model and dimensions as ingestion."""

import os

from openai import OpenAI

DIMENSIONS = 1536


class OpenAIQueryEmbedder:
    def __init__(self, client=None, model=None):
        self.model = model or os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
        self.client = client or OpenAI(max_retries=0, timeout=10)

    def embed(self, query: str) -> tuple[list[float], int]:
        response = self.client.embeddings.create(
            model=self.model, input=[query], dimensions=DIMENSIONS, encoding_format="float"
        )

        return response.data[0].embedding, response.usage.prompt_tokens
