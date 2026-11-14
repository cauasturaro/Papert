"""Conversation summaries (L2) and durable learner notes (L3) as the tutor receives them."""

import re
from typing import Annotated, Literal

from pydantic import Field

from src.shared.domain.workspace import StrictModel

SUMMARY_ITEMS = 4
# Pending actions are what a resumed conversation most needs; they get more room.
PENDING_ITEMS = 6
SUMMARY_ITEM_CHARACTERS = 160
FALLBACK_PROMPT_CHARACTERS = 120

SummaryItem = Annotated[str, Field(min_length=1, max_length=SUMMARY_ITEM_CHARACTERS)]


class SummaryContent(StrictModel):
    """What a summary keeps of folded turns; objective and step always come from Core."""

    covered: Annotated[list[SummaryItem], Field(max_length=SUMMARY_ITEMS)]
    pending: Annotated[list[SummaryItem], Field(max_length=PENDING_ITEMS)]
    struggles: Annotated[list[SummaryItem], Field(max_length=SUMMARY_ITEMS)]


class Summary(SummaryContent):
    # The step the summary was written at; it may be earlier than the current step.
    stepId: Annotated[str, Field(min_length=1, max_length=100)]


class Note(StrictModel):
    """A durable memory the learner approved; untrusted text about how they learn."""

    id: Annotated[str, Field(min_length=36, max_length=36)]
    kind: Literal["preference", "difficulty"]
    text: Annotated[str, Field(min_length=3, max_length=200)]


def bounded(items: list[str], limit: int = SUMMARY_ITEMS) -> list[str]:
    """Trimmed, single-spaced, deduplicated items within the summary limits; newest kept."""
    result: list[str] = []

    for item in items:
        text = " ".join(item.split())[:SUMMARY_ITEM_CHARACTERS]

        if text and text.lower() not in {kept.lower() for kept in result}:
            result.append(text)

    return result[-limit:]


def fallback_summary(previous: SummaryContent | None, prompts: list[str]) -> SummaryContent:
    """Deterministic summary when the model cannot write one: earlier items plus what was asked."""
    asked = [f"Asked: {prompt[:FALLBACK_PROMPT_CHARACTERS]}" for prompt in prompts]

    if previous is None:
        return SummaryContent(covered=bounded(asked), pending=[], struggles=[])

    return SummaryContent(
        covered=bounded([*previous.covered, *asked]),
        pending=bounded(previous.pending, PENDING_ITEMS),
        struggles=bounded(previous.struggles),
    )


PROPOSAL_MIN = 3
PROPOSAL_MAX = 200

# A durable note describes how the learner learns; anything else is rejected server-side.
# Ordinary punctuation such as ";" is prose, not code (measured: it dropped valid difficulties).
_CODE = re.compile(r"`|[{}]|=>|\bdef\s|\bfunction\s|</?\w+>|\w\(\)")
_LINK = re.compile(r"https?://|www\.", re.IGNORECASE)
_SECRET = re.compile(
    r"\b(password|passwd|secret|token|api[ _-]?key|credential)s?\b|\bsk-[A-Za-z0-9]", re.IGNORECASE
)
_AUTHORITY = re.compile(
    r"\b(allowed|permitted|permission|authori[sz]ed|unlock\w*|bypass\w*|approve\w*|"
    r"full solution|complete solution|ignore (all |the |previous |your )?(rules|instructions))\b",
    re.IGNORECASE,
)


def proposal(kind: str, text: str) -> dict | None:
    """Seymour's suggestion to remember something, or None when it must not leave Seymour.

    This is an output guardrail only; Core decides duplicates, limits and expiry.
    """
    if kind not in {"preference", "difficulty"}:
        return None

    normalized = " ".join(text.split())

    if not PROPOSAL_MIN <= len(normalized) <= PROPOSAL_MAX:
        return None

    unsafe = any(pattern.search(normalized) for pattern in (_CODE, _LINK, _SECRET, _AUTHORITY))
    if unsafe:
        return None

    return {"kind": kind, "text": normalized}
