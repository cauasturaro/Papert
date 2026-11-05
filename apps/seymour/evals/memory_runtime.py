"""Shared wiring for the memory evals: fixtures, tutor contexts and the real-model runtime."""

import json
import os
import re
import time
from pathlib import Path
from uuid import uuid4

from src.shared.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
from src.shared.infrastructure.tracing import ExecutionTrace
from src.tutor.application.guidance import Guidance, guidance_schema
from src.tutor.application.summary import SUMMARY_OUTPUT_LIMITS, summary_schema
from src.tutor.application.tools import TOOL_ARGUMENTS
from src.tutor.application.tutor import run_tutor
from src.tutor.domain.context import TutorContext

FIXTURES = Path(__file__).parent / "fixtures" / "memory"


def load(name):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def context_of(step, **fields):
    return TutorContext(
        sessionId=str(uuid4()),
        stepId=step["stepId"],
        objective=step["objective"],
        stepTitle=step["stepTitle"],
        files=step["files"],
        challenge=step["challenge"],
        conversationId=str(uuid4()),
        **fields,
    )


class Runtime:
    def __init__(self):
        self.retries = 0
        self.trace = ExecutionTrace(TOOL_ARGUMENTS)
        self.model_name = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)
        key = os.environ["OPENAI_API_KEY"]
        self.tutor = OpenAIModel(
            key, self.model_name, self.trace.generation, "tutor_guidance", guidance_schema()
        )
        self.summarizer = OpenAIModel(
            key,
            self.model_name,
            self.trace.generation,
            "conversation_summary",
            summary_schema(),
            SUMMARY_OUTPUT_LIMITS,
        )

    def ask(self, context, prompt, mode="doubt"):
        """Retries one provider failure (timeouts, 5xx); fallback itself is measured elsewhere."""
        try:
            return self._ask(context, prompt, mode)
        except Exception as error:
            print(f"  retrying after {type(error).__name__}")
            self.retries += 1

            return self._ask(context, prompt, mode)

    def _ask(self, context, prompt, mode):
        """One tutor answer plus the model's raw guidance JSON (before the server filter)."""
        raw = []
        complete = self.tutor.complete

        def recording(*args, **kwargs):
            response = complete(*args, **kwargs)
            if not response.tool_calls:
                raw.append(response.content)

            return response

        self.tutor.complete = recording

        try:
            with self.trace.execution(str(uuid4()), context.sessionId):
                result = run_tutor(
                    context,
                    prompt,
                    mode,
                    "low",
                    False,
                    8000,
                    self.tutor,
                    lambda: True,
                    lambda _text, _tokens: None,
                    self.trace.tool,
                    clock=time.monotonic,
                    summarizer=self.summarizer,
                )
        finally:
            self.tutor.complete = complete

        guidance = None
        if raw:
            try:
                guidance = Guidance.model_validate_json(raw[-1])
            except ValueError:
                guidance = None

        return result, guidance


def normalized(text):
    return re.sub(r"[-_\s]+", " ", text.lower())
