"""The tutor's first user message: the request and the context Core authorized for it."""

import json

from src.tutor.application.conversation import (
    conversation_summary,
    learner_memory,
    recent_turns,
)
from src.tutor.domain.context import TutorContext
from src.tutor.domain.memory import SummaryContent

# Room for the step, tree and a selection of up to SELECTION_CHARACTERS; the model adapter
# still counts exact input tokens against the attempt budget.
WORKING_CONTEXT_BYTES = 9000


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

    mentioned = context.mentioned_files(prompt)
    if mentioned:
        request["mentioned_files"] = mentioned

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

    # Escaping non-ASCII text inflates its token count and hides the text the model must quote verbatim.
    return json.dumps(request, ensure_ascii=False)
