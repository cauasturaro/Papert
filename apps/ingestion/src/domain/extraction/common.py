"""Located text values and shared extraction bounds and cleaning."""

import re
import textwrap
import time
from dataclasses import dataclass, field

from src.domain.errors import IngestionFailure

MAX_PAGES = 300
MAX_CHARACTERS = 600_000
MAX_ZIP_UNCOMPRESSED = 100 * 1024 * 1024
EXTRACTION_SECONDS = 60
MAX_INDENT = 16


@dataclass(frozen=True)
class Block:
    text: str
    location: dict


@dataclass(frozen=True)
class Extracted:
    blocks: list[Block]
    page_count: int | None = None
    warnings: list[str] = field(default_factory=list)

    @property
    def character_count(self):
        return sum(len(block.text) for block in self.blocks)


def _check_text_limit(blocks):
    total = sum(len(block.text) for block in blocks)

    if total > MAX_CHARACTERS:
        raise IngestionFailure("too_much_text")


def _check_deadline(started):
    if time.monotonic() - started > EXTRACTION_SECONDS:
        raise IngestionFailure("too_large")


def _clean(text):
    """Drops control characters and layout padding but keeps line indentation (code, JSON)."""
    without_controls = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", text)
    lines = []

    for line in without_controls.expandtabs(4).splitlines():
        body = line.strip()
        indent = min(len(line) - len(line.lstrip(" ")), MAX_INDENT)

        # Wide gaps are column padding from page layout; two spaces keep columns apart.
        compact = re.sub(r" {3,}", "  ", body)
        lines.append(" " * indent + compact if compact else "")

    dedented = textwrap.dedent("\n".join(lines))
    paragraphs = re.sub(r"\n{3,}", "\n\n", dedented)

    return paragraphs.strip("\n")
