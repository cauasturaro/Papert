"""Short-term conversation context: recent exchanges and follow-up search queries."""

from src.tutor.domain.context import TutorContext

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


def search_query(context: TutorContext, prompt: str) -> str:
    """Short follow-ups ('show me that example') are searched with the previous question."""
    if not context.recentTurns or len(prompt) > FOLLOW_UP_CHARACTERS:
        return prompt

    previous = context.recentTurns[-1].prompt[:TURN_PROMPT_CHARACTERS]

    return f"{previous}\n{prompt}"
