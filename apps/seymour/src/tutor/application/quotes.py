"""Server-side quoting: the model points at source lines, the server copies them verbatim."""

import re

QUOTE_CHARACTERS = 1200
MAX_QUOTE_LINES = 60


def _compact(text: str) -> str:
    # PDF layout and model output differ only in whitespace.
    return re.sub(r"\s+", "", text)


def source_lines(excerpts: list[dict]) -> list[tuple[str, str, str]]:
    """(document, cite, line) in reading order; overlapping chunk text appears once."""
    documents: dict[str, list[dict]] = {}

    for excerpt in excerpts:
        documents.setdefault(excerpt["sourceId"], []).append(excerpt)

    lines = []

    for document, parts in documents.items():
        text, owners = _merged(sorted(parts, key=lambda part: part["start"]))
        position = 0

        for line in text.split("\n"):
            lines.append((document, _owner(owners, position), line))
            position += len(line) + 1

    return lines


def _merged(parts: list[dict]) -> tuple[str, list[tuple[int, str]]]:
    """Rebuilds contiguous document text; owners map merged offsets to excerpt cites."""
    text = ""
    owners: list[tuple[int, str]] = []
    cursor = None

    for part in parts:
        content = part["text"]
        end = part["start"] + len(content)

        if cursor is not None and end <= cursor:
            continue

        if cursor is not None and part["start"] < cursor:
            # Chunks of one page overlap; keep only the characters not seen yet.
            content = content[cursor - part["start"] :]
        elif text:
            # Excerpts that are not adjacent in the document stay on separate lines.
            text += "\n"

        owners.append((len(text), part["cite"]))
        text += content
        cursor = end

    return text, owners


def _owner(owners: list[tuple[int, str]], position: int) -> str:
    cite = owners[0][1]

    for start, owner in owners:
        if start > position:
            break

        cite = owner

    return cite


MARKER_CHARACTERS = 60


def extract_quote(first: str, last: str, excerpts: list[dict]) -> tuple[str, list[str]] | None:
    """Verbatim source lines from the one where `first` begins to the one where `last` ends.

    Markers are compared without whitespace and may span several lines; only the start of
    `first` and the end of `last` are used, so the model need not copy them precisely in
    length. Both must be found in the same document, in order, within MAX_QUOTE_LINES.
    Returns the text (cut at a line boundary) and the cites it spans.
    """
    cites = {excerpt["cite"] for excerpt in excerpts}
    start_marker = _compact(_without_cite(first, cites))[:MARKER_CHARACTERS]
    end_marker = _compact(_without_cite(last, cites))[-MARKER_CHARACTERS:] or start_marker
    lines = source_lines(excerpts)

    # Pointing at an excerpt only (its cite) asks for the example it contains.
    if not start_marker:
        named = first.strip().rstrip(":")

        return _example_block(lines, named) if named in cites else None
    documents = list(dict.fromkeys(document for document, _cite, _line in lines))

    for document in documents:
        entries = [entry for entry in lines if entry[0] == document]
        span = _span(entries, start_marker, end_marker)

        if span is not None:
            return _bounded(entries[span[0] : span[1] + 1])

    return None


HTTP_REQUEST = re.compile(r"^\s*(GET|POST|PUT|PATCH|DELETE)\s+/")


def _example_block(lines: list[tuple[str, str, str]], cite: str):
    """First HTTP request line and/or brace-balanced JSON block within one excerpt."""
    entries = [entry for entry in lines if entry[1] == cite]
    start = next(
        (
            index
            for index, (_document, _cite, line) in enumerate(entries)
            if HTTP_REQUEST.match(line) or line.strip().startswith("{")
        ),
        None,
    )

    if start is None:
        return None

    depth = 0
    opened = False

    for index in range(start, min(len(entries), start + MAX_QUOTE_LINES)):
        line = entries[index][2]
        depth += line.count("{") - line.count("}")
        opened = opened or "{" in line

        if opened and depth <= 0:
            return _bounded(entries[start : index + 1])

    return _bounded(entries[start : start + 1])


def _without_cite(marker: str, cites: set[str]) -> str:
    """Models sometimes prefix a marker with its citation ("guide.pdf, p. 1: POST /login")."""
    stripped = marker.strip()

    for cite in cites:
        if stripped.startswith(cite):
            return stripped[len(cite) :].lstrip(" :")

    return stripped


def _span(entries: list[tuple[str, str, str]], start_marker: str, end_marker: str):
    """Line indexes containing the markers, matched on the document's compact text."""
    compact_lines = [_compact(line) for _document, _cite, line in entries]
    text = "".join(compact_lines)

    start = text.find(start_marker)

    if start < 0:
        return None

    end = text.find(end_marker, start)

    if end < 0:
        return None

    first_line = _line_at(compact_lines, start)
    last_line = _line_at(compact_lines, end + len(end_marker) - 1)

    if last_line - first_line >= MAX_QUOTE_LINES:
        return None

    return first_line, last_line


def _line_at(compact_lines: list[str], position: int) -> int:
    offset = 0

    for index, line in enumerate(compact_lines):
        offset += len(line)

        if position < offset:
            return index

    return len(compact_lines) - 1


def _bounded(selected: list[tuple[str, str, str]]) -> tuple[str, list[str]]:
    kept = []
    length = 0

    for entry in selected:
        length += len(entry[2]) + 1

        if length > QUOTE_CHARACTERS and kept:
            break

        kept.append(entry)

    text = "\n".join(line for _document, _cite, line in kept).strip("\n")

    if len(kept) < len(selected):
        text += "\n..."

    cites = list(dict.fromkeys(cite for _document, cite, _line in kept))

    return text, cites


# Learner wording that asks to see source text; then any quote of the excerpts is wanted.
SHOW_REQUEST = re.compile(
    r"\b(show|see|example|sample|quote|exact|verbatim|payload|body|snippet|request|response)\b",
    re.IGNORECASE,
)
TERM = re.compile(r"[a-z0-9][a-z0-9_-]+")
COMMON_WORDS = {"about", "there", "these", "those", "which", "would", "should", "could", "their"}


def _terms(text: str) -> set[str]:
    """Distinctive terms: anything with a digit (limits, codes) or words of 5+ letters."""
    words = TERM.findall(text.lower())

    return {
        word for word in words if (_has_digit(word) or len(word) >= 5) and word not in COMMON_WORDS
    }


def _has_digit(word: str) -> bool:
    return any(char.isdigit() for char in word)


def quote_supports(quote: str, explanation: str, prompt: str) -> bool:
    """A quote is shown when the learner asked to see source text or it backs the explanation."""
    if SHOW_REQUEST.search(prompt):
        return True

    return bool(_terms(quote) & _terms(explanation))


def attributed_cites(excerpts: list[dict], answer: str, prompt: str) -> list[str]:
    """Cites of excerpts whose numbers or codes the answer states and the question did not.

    The model often leaves its sources list empty while answering from an excerpt; a fact
    such as a limit or an error code copied from it is deterministic evidence of use.
    """
    stated = {term for term in _terms(answer) if _has_digit(term)} - _terms(prompt)
    cites = []

    for excerpt in excerpts:
        if stated & _terms(excerpt["text"]):
            cites.append(excerpt["cite"])

    return list(dict.fromkeys(cites))
