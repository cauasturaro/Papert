"""Batch text embeddings with the same model and dimensions as source retrieval."""

import os

import tiktoken
from openai import OpenAI

DIMENSIONS = 1536


class OpenAITextEmbedder:
    def __init__(self, client=None, model=None):
        self.model = model or os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
        self.client = client or OpenAI(max_retries=0, timeout=15)
        self._encoding = None

    def count_tokens(self, text: str) -> int:
        if self._encoding is None:
            self._encoding = tiktoken.encoding_for_model(self.model)

        return len(self._encoding.encode(text, disallowed_special=()))

    def embed_many(self, texts: list[str]) -> tuple[list[list[float]], int]:
        response = self.client.embeddings.create(
            model=self.model, input=texts, dimensions=DIMENSIONS, encoding_format="float"
        )
        ordered = sorted(response.data, key=lambda item: item.index)

        return [item.embedding for item in ordered], response.usage.prompt_tokens
