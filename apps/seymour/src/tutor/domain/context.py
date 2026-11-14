"""The tutor's read capability is a Core-authorized execution snapshot."""

import json
from typing import Annotated, Literal

from pydantic import Field, model_validator

from src.shared.domain.workspace import Challenge, StrictModel, validate_workspace
from src.tutor.domain.memory import Note, Summary

# The editor discloses this cap to the learner; the byte allowance below may shorten it further.
SELECTION_CHARACTERS = 4000
SELECTION_FALLBACKS = (SELECTION_CHARACTERS, 1000, 0)

# Saved files the learner named with "@path" in the prompt, sent beside the request.
MENTIONED_FILES = 2
MENTIONED_FILE_CHARACTERS = 1500


class Selection(StrictModel):
    start: Annotated[int, Field(ge=0)]
    end: Annotated[int, Field(ge=0)]


class RecentResult(StrictModel):
    revision: Annotated[int, Field(ge=0)]
    result: dict


class SourceRef(StrictModel):
    id: Annotated[str, Field(min_length=36, max_length=36)]
    filename: Annotated[str, Field(min_length=1, max_length=200)]
    format: Literal["pdf", "doc", "docx", "md"]


class Turn(StrictModel):
    """A previous exchange of this conversation, captured by Core."""

    prompt: Annotated[str, Field(max_length=2000)]
    answer: Annotated[str, Field(max_length=4000)]


class TutorContext(StrictModel):
    sessionId: Annotated[str, Field(min_length=1, max_length=100)]
    stepId: Annotated[str, Field(min_length=1, max_length=100)]
    objective: Annotated[str, Field(min_length=1, max_length=8000)]
    stepTitle: Annotated[str, Field(min_length=1, max_length=8000)]
    files: dict[str, str]
    challenge: Challenge
    activeFile: str | None = None
    selection: Selection | None = None
    recentResults: Annotated[list[RecentResult], Field(max_length=3)] = Field(default_factory=list)
    # Ready sources Core authorized for this workspace, and the ones the learner mentioned.
    workspaceId: str | None = None
    sources: Annotated[list[SourceRef], Field(max_length=20)] = Field(default_factory=list)
    sourceIds: Annotated[list[str], Field(max_length=5)] = Field(default_factory=list)
    # L2: the conversation's summary, its newest turns and the oldest turns to fold now.
    conversationId: str | None = None
    summary: Summary | None = None
    recentTurns: Annotated[list[Turn], Field(max_length=4)] = Field(default_factory=list)
    foldTurns: Annotated[list[Turn], Field(max_length=3)] = Field(default_factory=list)
    # L3: durable notes the learner approved.
    memory: Annotated[list[Note], Field(max_length=10)] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_workspace(self):
        validate_workspace(self.files)

        authorized = {source.id for source in self.sources}

        if self.sources and self.workspaceId is None:
            raise ValueError("Sources require the authorized workspace")

        if not set(self.sourceIds) <= authorized:
            raise ValueError("Mentioned sources are outside the authorized snapshot")

        if self.activeFile is not None and (
            self.activeFile not in self.files or self.activeFile.endswith("/")
        ):
            raise ValueError("Active file is outside the authorized snapshot")

        if self.selection is not None:
            if self.activeFile is None:
                raise ValueError("A selection requires an active file")

            content = self.files[self.activeFile].encode("utf-16-le")
            if not 0 <= self.selection.start <= self.selection.end <= len(content) // 2:
                raise ValueError("Selection is outside the saved file")

            content[self.selection.start * 2 : self.selection.end * 2].decode("utf-16-le")

        return self

    def _source_summary(self) -> dict:
        """Mentioned sources first; ids are what search_sources accepts."""
        mentioned = [source for source in self.sources if source.id in self.sourceIds]
        others = [source for source in self.sources if source.id not in self.sourceIds]
        listed = (mentioned + others)[:10]

        return {
            "available": [{"id": source.id, "name": source.filename[:60]} for source in listed],
            "truncated": len(self.sources) > len(listed),
            "mentioned": [source.id for source in mentioned],
        }

    def mentioned_files(self, prompt: str) -> list[dict]:
        """Saved files named as "@path" in the prompt, in order of first mention, bounded."""
        paths = [path for path in self.files if not path.endswith("/") and f"@{path}" in prompt]
        paths.sort(key=lambda path: prompt.index(f"@{path}"))

        return [
            {
                "path": path,
                "content": self.files[path][:MENTIONED_FILE_CHARACTERS],
                "truncated": len(self.files[path]) > MENTIONED_FILE_CHARACTERS,
            }
            for path in paths[:MENTIONED_FILES]
        ]

    def working_context(self, max_bytes: int) -> dict:
        """Bound L1 by bytes; the model adapter must still count exact input tokens."""
        result = {
            "objective": self.objective[:128],
            "stepId": self.stepId,
            "stepTitle": self.stepTitle[:60],
            "activeFile": self.activeFile,
            # Workspaces hold at most 20 entries, so the model sees every path read_code accepts.
            "tree": list(self.files),
            "selectedCode": "",
            "recentResults": [
                {
                    "revision": result.revision,
                    "status": str(result.result.get("status", "unknown"))[:30],
                }
                for result in self.recentResults
            ],
            "sources": self._source_summary(),
        }

        selected = ""
        if self.activeFile is not None and self.selection is not None:
            # Editor offsets use UTF-16 code units, including astral characters.
            content = self.files[self.activeFile].encode("utf-16-le")
            selected = content[self.selection.start * 2 : self.selection.end * 2].decode(
                "utf-16-le"
            )
            start = len(content[: self.selection.start * 2].decode("utf-16-le"))
            result["selection"] = {"start": start, "end": start + len(selected)}

        encoded = ""

        # Shorten the selection until the context fits; an empty selection is the last resort.
        for limit in SELECTION_FALLBACKS:
            result["selectedCode"] = selected[:limit]
            if selected:
                result["selectionTruncated"] = len(selected) > limit

            encoded = json.dumps(result, ensure_ascii=False)
            if len(encoded.encode()) <= max_bytes:
                break

        if len(encoded.encode()) > max_bytes:
            raise ValueError("Working context exceeds the input allowance; narrow the selection")

        return result


class ToolResult(StrictModel):
    kind: Literal["code", "structure", "criteria", "test_evidence", "sources", "error"]
    data: dict
