"""Batch text embeddings with the same model and dimensions as source retrieval."""

import os

import tiktoken
from openai import OpenAI

from src.shared.domain.index_format import DIMENSIONS


class OpenAIEmbeddings:
    def __init__(self, client=None, model=None, *, timeout: float = 15):
        self.model = model or os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
        self.client = client or OpenAI(max_retries=0, timeout=timeout)
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

        if len(ordered) != len(texts) or any(
            type(item.index) is not int or item.index != index or len(item.embedding) != DIMENSIONS
            for index, item in enumerate(ordered)
        ):
            raise RuntimeError("Embedding response does not match the request")

        tokens = response.usage.prompt_tokens
        total = response.usage.total_tokens
        if type(tokens) is not int or tokens < 0 or type(total) is not int or total != tokens:
            raise RuntimeError("Invalid embedding usage")

        return [item.embedding for item in ordered], tokens
