"""Collaborators supplied by executions to the orchestrated use cases."""

from collections.abc import Callable
from dataclasses import dataclass

from src.executions.domain.ports import ExecutionTracer
from src.recommendation.domain.ports import EmbeddingCache, TextEmbedder
from src.retrieval.domain.ports import Search
from src.shared.domain.inference import Model


@dataclass(frozen=True)
class ExecutionResources:
    model: Model
    trace: ExecutionTracer
    clock: Callable[[], float]
    search: Search | None = None


@dataclass(frozen=True)
class RecommendationResources:
    embedder: TextEmbedder
    cache: EmbeddingCache
    trace: ExecutionTracer
