"""Read-only tools. No filesystem, network, shell, or learner-code execution."""

import json

from pydantic import ValidationError

from src.retrieval.application.grounding import EXCERPT_CHARACTERS, cited_excerpts
from src.retrieval.domain.ports import Search
from src.tutor.application.contracts.tool_request import (
    READ_CODE_CHARACTERS,
    ReadCode,
    ReadStep,
    SearchSources,
    tool_schema,
)
from src.tutor.application.prompts import TOOL_DESCRIPTIONS
from src.tutor.domain.context import ToolResult, TutorContext

TOOL_ARGUMENTS = {
    "read_code": ReadCode,
    "read_structure": ReadStep,
    "read_criteria": ReadStep,
    "read_test_evidence": ReadStep,
    "search_sources": SearchSources,
}


def recorded_result(result: dict) -> dict:
    """Compact analysis evidence: statuses, unmet criteria and hints, never another approval path."""
    recorded = result.get("evaluation")
    evaluation: dict = recorded if isinstance(recorded, dict) else {}

    listed_criteria = evaluation.get("criteria")
    criteria: list = listed_criteria if isinstance(listed_criteria, list) else []

    listed_hints = evaluation.get("hints")
    hints: list = listed_hints if isinstance(listed_hints, list) else []

    return {
        "status": str(result.get("status", "unknown"))[:30],
        "unmetCriteria": [
            {"id": str(item.get("id"))[:200], "feedback": str(item.get("feedback"))[:600]}
            for item in criteria
            if isinstance(item, dict) and item.get("status") == "not_met"
        ][:20],
        "hints": [str(hint)[:300] for hint in hints][:3],
    }


def tool_definitions(context: TutorContext | None = None) -> list[dict]:
    # Offer search only when Core authorized at least one ready source.
    names = [
        name
        for name in TOOL_ARGUMENTS
        if name != "search_sources" or (context is not None and context.sources)
    ]

    return [
        {
            "name": name,
            "description": TOOL_DESCRIPTIONS[name],
            "input_schema": tool_schema(TOOL_ARGUMENTS[name]),
        }
        for name in names
    ]


def search_sources(context: TutorContext, request: SearchSources, search: Search | None):
    filenames = {source.id: source.filename for source in context.sources}

    if not filenames or search is None:
        return ToolResult(kind="error", data={"message": "No sources are available"})

    if not set(request.sourceIds) <= set(filenames):
        return ToolResult(kind="error", data={"message": "Source is not authorized"})

    passages, tokens = search(request.query, request.sourceIds or list(filenames))
    excerpts = cited_excerpts(filenames, passages, EXCERPT_CHARACTERS)

    return ToolResult(kind="sources", data={"excerpts": excerpts, "embeddingTokens": tokens})


def read_code(context: TutorContext, request: ReadCode) -> ToolResult:
    content = context.files.get(request.path)
    if content is None or request.path.endswith("/"):
        return ToolResult(kind="error", data={"message": "File is not authorized"})

    lines = content.splitlines(keepends=True)
    start = request.startLine or 1
    end = min(request.endLine or len(lines), len(lines))

    past_the_end = bool(lines) and start > len(lines)
    reversed_range = request.endLine is not None and request.endLine < start
    if past_the_end or reversed_range:
        return ToolResult(kind="error", data={"message": "Invalid line range"})

    text = "".join(lines[start - 1 : end])
    truncated = len(text) > READ_CODE_CHARACTERS

    return ToolResult(
        kind="code",
        data={
            "path": request.path,
            "startLine": start,
            "endLine": end,
            "lineCount": len(lines),
            "content": text[:READ_CODE_CHARACTERS],
            "truncated": truncated,
        },
    )


def call_tool(
    context: TutorContext, name: str, arguments: dict, search: Search | None = None
) -> ToolResult:
    schema = TOOL_ARGUMENTS.get(name)
    if schema is None:
        return ToolResult(kind="error", data={"message": "Unknown tool"})

    try:
        request = schema.model_validate(arguments)
    except ValidationError:
        return ToolResult(kind="error", data={"message": "Invalid tool arguments"})

    if isinstance(request, SearchSources):
        result = search_sources(context, request, search)
    elif isinstance(request, ReadCode):
        result = read_code(context, request)
    elif name == "read_structure":
        result = ToolResult(kind="structure", data={"paths": list(context.files)})
    elif name == "read_criteria":
        result = ToolResult(kind="criteria", data=context.challenge.model_dump())
    else:
        # Saved code is not executed test evidence.
        result = ToolResult(
            kind="test_evidence",
            data={
                "status": "not_evaluated",
                "tests": [],
                "recentResults": [
                    {"revision": result.revision, **recorded_result(result.result)}
                    for result in context.recentResults
                ],
            },
        )

    if len(json.dumps(result.model_dump(), ensure_ascii=False).encode()) > 12000:
        return ToolResult(
            kind="error", data={"message": "Tool result exceeds the context allowance"}
        )

    return result
