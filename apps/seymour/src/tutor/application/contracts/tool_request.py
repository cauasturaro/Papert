"""Model-facing argument contracts for authorized read-only tools."""

from typing import Annotated

from pydantic import Field

from src.shared.domain.workspace import StrictModel
from src.tutor.domain.context import Turn


class ReadCode(StrictModel):
    stepId: str
    path: Annotated[str, Field(min_length=1, max_length=200)]
    start: Annotated[int, Field(ge=0)] = 0
    length: Annotated[int, Field(ge=1, le=2000)] = 1000


class ReadStep(StrictModel):
    stepId: str


class SearchSources(StrictModel):
    stepId: str
    query: Annotated[str, Field(min_length=1, max_length=300)]
    sourceIds: Annotated[list[str], Field(max_length=5)] = Field(default_factory=list)
    recentTurns: Annotated[list[Turn], Field(max_length=3)] = Field(default_factory=list)
