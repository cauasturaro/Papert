"""Shared authorized workspace values and pure validation rules."""

import json
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class Criterion(StrictModel):
    id: Annotated[str, Field(min_length=1, max_length=8000)]
    description: Annotated[str, Field(min_length=1, max_length=8000)]


class Challenge(StrictModel):
    instructions: Annotated[str, Field(min_length=1, max_length=8000)]
    criteria: Annotated[list[Criterion], Field(min_length=1, max_length=20)]


def validate_workspace(files: dict[str, str]) -> None:
    if (
        len(files) > 20
        or len(json.dumps(files, ensure_ascii=False, separators=(",", ":")).encode()) > 64000
    ):
        raise ValueError("Workspace exceeds its authorized size")

    for path, content in files.items():
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
