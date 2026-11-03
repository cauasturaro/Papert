"""The tutor's structured answer and how the server renders it for the learner."""

from pydantic import ConfigDict, Field

from src.tutor.application.quotes import extract_quote
from src.tutor.domain.context import StrictModel


class Guidance(StrictModel):
    # OpenAI strict schemas list every property as required, defaults included.
    model_config = ConfigDict(
        **StrictModel.model_config, json_schema_serialization_defaults_required=True
    )

    explanation: str = Field(min_length=1, max_length=2000)
    # Verbatim text copied from a source excerpt; shown only if it really is in one.
    # Exact first and last lines of a source passage to show; the server copies the text.
    quote_from: str = Field(default="", max_length=300)
    quote_to: str = Field(default="", max_length=300)
    next_step: str = Field(min_length=1, max_length=800)
    question: str = Field(min_length=1, max_length=500)
    # Cite strings of the source excerpts the answer used.
    sources: list[str] = Field(default_factory=list, max_length=5)


def render(guidance: Guidance, excerpts: list[dict]) -> str:
    """Quotes are copied from retrieved excerpts; citations must name retrieved excerpts."""
    text = guidance.explanation
    quote = extract_quote(guidance.quote_from, guidance.quote_to, excerpts)
    origins = quote[1] if quote else []

    if quote:
        text += f"\n\nFrom {'; '.join(origins)}:\n{quote[0]}"

    text += f"\n\nNext step: {guidance.next_step}\n\n{guidance.question}"

    retrieved = {excerpt["cite"] for excerpt in excerpts}
    used = (item for item in guidance.sources if item in retrieved)
    cited = list(dict.fromkeys([*origins, *used]))

    if cited:
        text += "\n\nSources: " + "; ".join(cited)

    return text
