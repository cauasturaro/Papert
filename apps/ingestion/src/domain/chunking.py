"""Split extracted blocks into overlapping chunks with document offsets and locations."""

import math
from dataclasses import dataclass

from src.domain.errors import IngestionFailure

TARGET_CHARACTERS = 1600
OVERLAP_CHARACTERS = 200
MAX_CHUNKS = 800
SEPARATOR = "\n\n"

END_KEYS = ("paragraphEnd", "lineEnd")


@dataclass(frozen=True)
class Chunk:
    ordinal: int
    content: str
    location: dict
    char_start: int
    char_end: int

    @property
    def token_estimate(self):
        # Approximation for later context budgeting; embedding usage is measured separately.
        return math.ceil(len(self.content) / 4)


def _document_text(blocks):
    """Joins blocks and records each block's span in the joined text."""
    spans = []
    position = 0

    for index, block in enumerate(blocks):
        if index:
            position += len(SEPARATOR)

        spans.append((position, position + len(block.text), block))
        position += len(block.text)

    text = SEPARATOR.join(block.text for block in blocks)

    return text, spans


def _segments(spans, hard_key):
    """Groups consecutive spans that may share a chunk (e.g. the same PDF page)."""
    groups = []

    for span in spans:
        key = span[2].location.get(hard_key) if hard_key else None

        if groups and groups[-1][0] == key:
            groups[-1][1].append(span)
        else:
            groups.append((key, [span]))

    return [(members[0][0], members[-1][1], members) for _, members in groups]


def _break_point(text, start, limit, block_ends):
    floor = start + TARGET_CHARACTERS // 2

    preferred = [end for end in block_ends if floor < end <= limit]
    if preferred:
        return preferred[-1]

    for marker in ("\n", ". ", " "):
        index = text.rfind(marker, floor, limit)

        if index > 0:
            return index + len(marker)

    return limit


def _overlap_start(text, start, end):
    candidate = max(end - OVERLAP_CHARACTERS, start + 1)
    space = text.find(" ", candidate, end)

    return space + 1 if space >= 0 else end


def _location(spans, start, end):
    covered = [
        block for block_start, block_end, block in spans if block_start < end and block_end > start
    ]
    location = dict(covered[0].location)

    for key in END_KEYS:
        if key in covered[-1].location:
            location[key] = covered[-1].location[key]

    return location


def _trimmed(text, start, end):
    while start < end and text[start].isspace():
        start += 1

    while end > start and text[end - 1].isspace():
        end -= 1

    return start, end


def chunk(extracted, hard_key=None):
    text, spans = _document_text(extracted.blocks)
    chunks = []

    for segment_start, segment_end, members in _segments(spans, hard_key):
        block_ends = [block_end for _, block_end, _ in members]
        start = segment_start

        while start < segment_end:
            limit = start + TARGET_CHARACTERS
            end = (
                segment_end
                if limit >= segment_end
                else _break_point(text, start, limit, block_ends)
            )
            content_start, content_end = _trimmed(text, start, end)

            if content_start < content_end:
                piece = Chunk(
                    ordinal=len(chunks),
                    content=text[content_start:content_end],
                    location=_location(members, content_start, content_end),
                    char_start=content_start,
                    char_end=content_end,
                )
                chunks.append(piece)

            if len(chunks) > MAX_CHUNKS:
                raise IngestionFailure("too_much_text")

            if end >= segment_end:
                break

            start = _overlap_start(text, start, end)

    if not chunks:
        raise IngestionFailure("no_text")

    return chunks
