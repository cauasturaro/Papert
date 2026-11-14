"""Model-facing argument contracts for authorized read-only tools.

The server already knows the step and conversation, so no tool asks the model for them.
"""

from typing import Annotated

from pydantic import Field

from src.shared.domain.workspace import StrictModel

# Upper bound of one read_code result; a longer range is truncated.
READ_CODE_CHARACTERS = 2000


class ReadCode(StrictModel):
    path: Annotated[
        str,
        Field(
            min_length=1,
            max_length=200,
            description="A file path from working_context.tree.",
        ),
    ]
    startLine: Annotated[
        int | None,
        Field(ge=1, description="First line to read, starting at 1; null reads from the top."),
    ] = None
    endLine: Annotated[
        int | None,
        Field(ge=1, description="Last line to read, inclusive; null reads to the end."),
    ] = None


class ReadStep(StrictModel):
    pass


class SearchSources(StrictModel):
    query: Annotated[
        str,
        Field(min_length=1, max_length=300, description="What to look for in the sources."),
    ]
    sourceIds: Annotated[
        list[str],
        Field(
            max_length=5,
            description="Ids from working_context.sources to restrict the search; empty searches all.",
        ),
    ] = Field(default_factory=list)


def tool_schema(contract: type[StrictModel]) -> dict:
    """Strict tool schemas list every property as required; nullable fields carry the defaults."""
    schema = contract.model_json_schema()
    schema["required"] = list(schema.get("properties", {}))

    return schema
