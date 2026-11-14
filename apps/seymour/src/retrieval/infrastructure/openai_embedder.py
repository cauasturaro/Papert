from src.shared.domain.index_format import DIMENSIONS as DIMENSIONS
from src.shared.infrastructure.openai_embeddings import OpenAIEmbeddings


class OpenAIQueryEmbedder(OpenAIEmbeddings):
    def __init__(self, client=None, model=None):
        super().__init__(client, model, timeout=10)

    def embed(self, query: str) -> tuple[list[float], int]:
        vectors, tokens = self.embed_many([query])

        return vectors[0], tokens
