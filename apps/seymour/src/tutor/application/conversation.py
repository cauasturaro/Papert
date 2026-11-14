"""Conversation context (L2), durable notes (L3) and follow-up search queries."""

from src.tutor.domain.context import TutorContext
from src.tutor.domain.memory import SummaryContent

TURN_PROMPT_CHARACTERS = 300
TURN_ANSWER_CHARACTERS = 600
FOLLOW_UP_CHARACTERS = 160


def recent_turns(context: TutorContext) -> list[dict]:
    return [
        {
            "learner": turn.prompt[:TURN_PROMPT_CHARACTERS],
            "seymour": turn.answer[:TURN_ANSWER_CHARACTERS],
        }
        for turn in context.recentTurns
    ]


def conversation_summary(summary: SummaryContent, written_at_step: str) -> dict:
    """Earlier turns as a summary, tagged with the step it was written at."""
    return {
        "writtenAtStep": written_at_step,
        "covered": summary.covered,
        "pending": summary.pending,
        "struggles": summary.struggles,
    }


def learner_memory(context: TutorContext) -> list[dict]:
    return [{"kind": note.kind, "text": note.text} for note in context.memory]


def search_query(context: TutorContext, prompt: str) -> str:
    """Short follow-ups ('show me that example') are searched with the previous question."""
    if not context.recentTurns or len(prompt) > FOLLOW_UP_CHARACTERS:
        return prompt

    previous = context.recentTurns[-1].prompt[:TURN_PROMPT_CHARACTERS]

    return f"{previous}\n{prompt}"
