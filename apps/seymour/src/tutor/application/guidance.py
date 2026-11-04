"""The tutor's structured answer and how the server renders it for the learner."""

from pydantic import Field

from src.tutor.application.quotes import attributed_cites, extract_quote, quote_supports
from src.tutor.domain.context import StrictModel


class Guidance(StrictModel):
    explanation: str = Field(min_length=1, max_length=2000)
    # Verbatim text copied from a source excerpt; shown only if it really is in one.
    # Exact first and last lines of a source passage to show; the server copies the text.
    quote_from: str = Field(default="", max_length=300)
    quote_to: str = Field(default="", max_length=300)
    next_step: str = Field(min_length=1, max_length=800)
    question: str = Field(min_length=1, max_length=500)
    # Cite strings of the source excerpts the answer used.
    sources: list[str] = Field(default_factory=list, max_length=5)
    # False when the excerpts do not contain the answer; the server then cites nothing.
    answered_from_sources: bool = True


MAX_CITATIONS = 5


def _citation(cite: str, excerpts: list[dict]) -> dict:
    """The first retrieved excerpt with this cite: document, location and passage text."""
    excerpt = next(item for item in excerpts if item["cite"] == cite)

    return {
        "sourceId": excerpt["sourceId"],
        "cite": cite,
        "location": excerpt["location"],
        "excerpt": excerpt["text"],
        "quote": None,
    }


def render(guidance: Guidance, excerpts: list[dict], prompt: str = "") -> tuple[str, list[dict]]:
    """Answer text plus citations; only excerpts retrieved in this run can be cited or quoted."""
    text = f"{guidance.explanation}\n\nNext step: {guidance.next_step}\n\n{guidance.question}"

    quote = extract_quote(guidance.quote_from, guidance.quote_to, excerpts)

    # Measured: the model sometimes quotes an unrelated example; drop quotes that back nothing.
    if quote and not quote_supports(quote[0], guidance.explanation, prompt):
        quote = None

    origins = quote[1] if quote else []

    retrieved = {excerpt["cite"] for excerpt in excerpts}
    used = [item for item in guidance.sources if item in retrieved]
    stated = attributed_cites(excerpts, guidance.explanation, prompt)
    cites = list(dict.fromkeys([*origins, *used, *stated]))[:MAX_CITATIONS]

    # Measured: "not found" answers listed the searched excerpts as sources.
    if not guidance.answered_from_sources:
        return text, []

    citations = [_citation(cite, excerpts) for cite in cites]

    # Quotes come first in `cites`, so the quote belongs to the first citation.
    if quote:
        citations[0]["quote"] = quote[0]

    return text, citations


def grounding(has_sources: bool, citations: list[dict]) -> dict | None:
    """Whether the workspace's sources support the answer; None when it has no sources."""
    if not has_sources:
        return None

    support = "cited" if citations else "unsupported"

    return {"support": support, "citations": citations}
