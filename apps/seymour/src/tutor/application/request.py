"""The tutor's first user message: the request and the context Core authorized for it."""

import json

from src.tutor.application.conversation import (
    conversation_summary,
    learner_memory,
    recent_turns,
)
from src.tutor.domain.context import TutorContext
from src.tutor.domain.memory import SummaryContent

WORKING_CONTEXT_BYTES = 4000


def tutor_request(
    context: TutorContext,
    prompt: str,
    summary: SummaryContent | None,
    excerpts: list[dict] | None,
) -> str:
    request = {
        "request": prompt,
        "working_context": context.working_context(WORKING_CONTEXT_BYTES),
    }

    if summary is not None:
        # A summary folded in this run was written at the current step.
        written_at = context.stepId
        if not context.foldTurns and context.summary is not None:
            written_at = context.summary.stepId

        request["conversation_summary"] = conversation_summary(summary, written_at)

    if context.recentTurns:
        request["recent_turns"] = recent_turns(context)

    if context.memory:
        request["learner_memory"] = learner_memory(context)

    if excerpts is not None:
        request["source_excerpts"] = [
            {"cite": excerpt["cite"], "text": excerpt["text"]} for excerpt in excerpts
        ]

    return json.dumps(request)
