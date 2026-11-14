"""Shared wiring for the memory evals: fixtures, tutor contexts and the real-model runtime."""

import json
import re
import time
from collections.abc import Callable
from pathlib import Path
from uuid import uuid4

from evals.runtime import Runtime as EvalRuntime
from src.shared.domain.inference import Message, Model
from src.tutor.application.guidance import Guidance, guidance_task
from src.tutor.application.summary import summary_task
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


class RecordingModel:
    def __init__(self, model: Model):
        self.model = model
        self.raw: list[str] = []

    def complete(
        self,
        messages: list[Message],
        tools: list[dict],
        effort: str,
        remaining: int,
        deadline: float,
        active: Callable[[], bool],
    ) -> Message:
        response = self.model.complete(messages, tools, effort, remaining, deadline, active)
        if not response.tool_calls:
            self.raw.append(response.content)

        return response


class Runtime:
    def __init__(self):
        self.retries = 0
        runtime = EvalRuntime("memory", TOOL_ARGUMENTS)
        self.trace = runtime.trace
        self.model_name = runtime.model_name
        self.tutor = runtime.model(guidance_task())
        self.summarizer = runtime.model(summary_task())

    def ask(self, context, prompt, mode="doubt"):
        result, guidance = self._ask(context, prompt, mode)
        if result.get("failure") == "unavailable":
            self.retries += 1
            return self._ask(context, prompt, mode)

        return result, guidance

    def _ask(self, context, prompt, mode):
        """One tutor answer plus the model's raw guidance JSON (before the server filter)."""
        recording = RecordingModel(self.tutor)

        with self.trace.execution(str(uuid4()), context.sessionId):
            result = run_tutor(
                context,
                prompt,
                mode,
                "low",
                False,
                8000,
                recording,
                lambda: True,
                lambda _text, _tokens: None,
                self.trace.tool,
                clock=time.monotonic,
                summarizer=self.summarizer,
            )

        raw = recording.raw
        guidance = None
        if raw:
            try:
                guidance = Guidance.model_validate_json(raw[-1])
            except ValueError:
                guidance = None

        return result, guidance


def normalized(text):
    return re.sub(r"[-_\s]+", " ", text.lower())
