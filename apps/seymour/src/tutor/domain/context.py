"""The tutor's read capability is a Core-authorized execution snapshot."""

import json
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class Criterion(StrictModel):
    id: Annotated[str, Field(min_length=1, max_length=8000)]
    description: Annotated[str, Field(min_length=1, max_length=8000)]


class Challenge(StrictModel):
    instructions: Annotated[str, Field(min_length=1, max_length=8000)]
    criteria: Annotated[list[Criterion], Field(min_length=1, max_length=20)]


class Selection(StrictModel):
    start: Annotated[int, Field(ge=0)]
    end: Annotated[int, Field(ge=0)]


class RecentResult(StrictModel):
    revision: Annotated[int, Field(ge=0)]
    result: dict


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

    @model_validator(mode="after")
    def validate_workspace(self):
        if (
            len(self.files) > 20
            or len(json.dumps(self.files, ensure_ascii=False, separators=(",", ":")).encode())
            > 64000
        ):
            raise ValueError("Workspace exceeds its authorized size")

        for path, content in self.files.items():
            parts = path.removesuffix("/").split("/")
            valid_parts = all(
                part
                and part not in {".", "..", "__proto__", "constructor", "prototype"}
                and all(
                    character.isascii() and (character.isalnum() or character in "_.-")
                    for character in part
                )
                for part in parts
            )
            if not valid_parts or len(path) > 200 or len(content) > 16000:
                raise ValueError("Invalid workspace entry")
            if path.endswith("/") and content:
                raise ValueError("Directories cannot contain text")

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

    def working_context(self, max_bytes: int) -> dict:
        """Bound L1 by bytes; the model adapter must still count exact input tokens."""
        result = {
            "objective": self.objective[:128],
            "stepId": self.stepId,
            "stepTitle": self.stepTitle[:60],
            "activeFile": self.activeFile,
            "tree": list(self.files)[:5],
            "treeTruncated": len(self.files) > 5,
            "selectedCode": "",
            "recentResults": [
                {
                    "revision": result.revision,
                    "status": str(result.result.get("status", "unknown"))[:30],
                }
                for result in self.recentResults
            ],
        }
        if self.activeFile is not None and self.selection is not None:
            # Editor offsets use UTF-16 code units, including astral characters.
            content = self.files[self.activeFile].encode("utf-16-le")
            selected = content[self.selection.start * 2 : self.selection.end * 2].decode(
                "utf-16-le"
            )
            result["selectedCode"] = selected[:256]
            result["selectionTruncated"] = len(selected) > 256
            start = len(content[: self.selection.start * 2].decode("utf-16-le"))
            result["selection"] = {"start": start, "end": start + len(selected)}

        encoded = json.dumps(result, ensure_ascii=False)
        if len(encoded.encode()) > max_bytes and result["selectedCode"]:
            result["selectedCode"] = ""
            result["selectionTruncated"] = True
            encoded = json.dumps(result, ensure_ascii=False)

        if len(encoded.encode()) > max_bytes:
            raise ValueError("Working context exceeds the input allowance; narrow the selection")

        return result


class ReadCode(StrictModel):
    stepId: str
    path: Annotated[str, Field(min_length=1, max_length=200)]
    start: Annotated[int, Field(ge=0)] = 0
    length: Annotated[int, Field(ge=1, le=2000)] = 1000


class ReadStep(StrictModel):
    stepId: str


class ToolResult(StrictModel):
    kind: Literal["code", "structure", "criteria", "test_evidence", "error"]
    data: dict
