"""Extract Markdown blocks with line ranges and heading paths."""

import re

from src.domain.errors import IngestionFailure
from src.domain.extraction.common import Block, Extracted, _check_text_limit, _clean

HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
FENCE = re.compile(r"^\s*(```|~~~)")


def extract_markdown(data):
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise IngestionFailure("corrupt_file") from None

    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    blocks = []
    headings = []
    current = []
    start = None
    in_fence = False

    def flush(end_line):
        nonlocal current, start

        content = _clean("\n".join(current))

        if content:
            location = {"lineStart": start, "lineEnd": end_line, "headings": list(headings)}
            blocks.append(Block(content, location))
            _check_text_limit(blocks)

        current = []
        start = None

    for number, line in enumerate(lines, start=1):
        if FENCE.match(line):
            in_fence = not in_fence

        heading = None if in_fence else HEADING.match(line)

        if heading:
            flush(number - 1)

            level = len(heading.group(1))
            headings[:] = headings[: level - 1] + [heading.group(2)]

        if not line.strip() and not in_fence:
            flush(number - 1)
            continue

        if start is None:
            start = number

        current.append(line)

    flush(len(lines))

    if not blocks:
        raise IngestionFailure("no_text")

    return Extracted(blocks)
