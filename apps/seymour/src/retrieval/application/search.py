"""Semantic search restricted to the workspace and documents Core authorized."""

from src.retrieval.domain.ports import Passage, PassageIndex, QueryEmbedder


class SourceSearch:
    def __init__(
        self,
        workspace_id: str,
        document_ids: list[str],
        embedder: QueryEmbedder,
        index: PassageIndex,
    ):
        self.workspace_id = workspace_id
        self.document_ids = document_ids
        self.embedder = embedder
        self.index = index

    def search(self, query: str, document_ids: list[str], limit: int) -> tuple[list[Passage], int]:
        """Closest passages plus the chunk after the best one, and the query's embedding tokens."""
        allowed = [item for item in document_ids if item in self.document_ids] or self.document_ids

        vector, tokens = self.embedder.embed(query)
        passages = self.index.nearest(self.workspace_id, allowed, vector, limit)

        if not passages:
            return passages, tokens

        best = passages[0]
        following = self.index.following(self.workspace_id, best)
        seen = {(passage["documentId"], passage["ordinal"]) for passage in passages}

        # Content split across chunks (often a page break) continues in the next one.
        if following is not None and (following["documentId"], following["ordinal"]) not in seen:
            passages.insert(1, {**following, "distance": best["distance"]})

        return passages, tokens
