"""Deterministic model for demos and browser tests without a provider key.

Answers depend only on the request, so the same input always yields the same output and
usage. Every answer says it comes from the demo model. Attempt verdicts follow one visible
rule: a criterion is met when the files it names no longer contain the starter TODO marker.
"""

import json
import math
import time
from collections.abc import Callable

from src.shared.domain.inference import (
    Message,
    ModelTask,
    ModelUnavailable,
    ToolCall,
    TutorCancelled,
    fitted_output,
)
from src.shared.infrastructure.generation import GenerationCall, GenerationObserver, GenerationUsage

FAKE_MODEL_NAME = "papert-fake"
OUTPUT_LIMITS = {"low": 2048, "medium": 3072, "high": 4096}
CHARACTERS_PER_TOKEN = 4
STARTER_MARKER = "TODO"
DEMO_NOTE = "Demo mode: this answer comes from Papert's offline demo model, not a real tutor."


def estimated_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / CHARACTERS_PER_TOKEN))


def latest_request(messages: list[Message]) -> dict:
    """The newest user message that is a JSON object; repair notes are plain text."""
    for message in reversed(messages):
        if message.role != "user":
            continue

        try:
            request = json.loads(message.content)
        except ValueError:
            continue

        if isinstance(request, dict):
            return request

    return {}


def tool_result(messages: list[Message], name: str) -> dict:
    for message in messages:
        if message.role == "tool" and message.name == name:
            return json.loads(message.content)

    return {}


def tutor_answer(messages: list[Message], tools: list[dict]) -> tuple[str, list[ToolCall]]:
    """Reads the step's criteria once through a tool, then answers with that context."""
    tool_names = {tool["name"] for tool in tools}
    already_read = any(message.role == "tool" for message in messages)

    if "read_criteria" in tool_names and not already_read:
        return "", [{"id": "fake-call-1", "name": "read_criteria", "args": {}}]

    request = latest_request(messages)
    question = str(request.get("request", "")).strip()[:200]
    working = request.get("working_context") or {}
    active_file = working.get("activeFile") or "the step's files"

    criteria = tool_result(messages, "read_criteria").get("data", {}).get("criteria", [])
    if criteria:
        focus = (
            f"This step has {len(criteria)} acceptance criteria; start with “{criteria[0]['id']}”."
        )
    else:
        focus = "Start with the first acceptance criterion of this step."

    guidance = {
        "explanation": f"{DEMO_NOTE} You asked: “{question}”. {focus}",
        "quote_from": "",
        "quote_to": "",
        "next_step": f"Open {active_file} and replace the {STARTER_MARKER} with your own code.",
        "question": "Which criterion will you tackle first?",
        "sources": [],
        "answered_from_sources": False,
        "remember_kind": "none",
        "remember_text": "",
    }

    return json.dumps(guidance, ensure_ascii=False), []


def named_files(text: str, files: dict[str, str]) -> list[str]:
    return [path for path in files if path in text]


def first_marker_line(content: str) -> int | None:
    for number, line in enumerate(content.splitlines(), start=1):
        if STARTER_MARKER in line:
            return number

    return None


def evaluation_answer(messages: list[Message]) -> str:
    request = latest_request(messages)
    files = {
        path: content
        for path, content in (request.get("files") or {}).items()
        if not path.endswith("/")
    }
    instructions = str(request.get("instructions", ""))

    results = []
    pending: set[str] = set()

    for criterion in request.get("criteria") or []:
        # A criterion is judged on the files it names, else on those the step names.
        paths = (
            named_files(criterion["description"], files)
            or named_files(instructions, files)
            or list(files)
        )
        unfinished = [
            path for path in paths if STARTER_MARKER in files[path] or not files[path].strip()
        ]
        pending.update(unfinished)

        if unfinished:
            feedback = f"{unfinished[0]} still contains the starter {STARTER_MARKER} or is empty."
        else:
            feedback = f"{', '.join(paths)[:500]} no longer contains the starter {STARTER_MARKER}."

        results.append(
            {
                "id": criterion["id"],
                "status": "not_met" if unfinished else "met",
                "feedback": feedback,
            }
        )

    findings = [
        {
            "category": "structure",
            "severity": "warning",
            "path": path,
            "line": first_marker_line(files[path]),
            "message": f"The starter {STARTER_MARKER} marker is still here.",
        }
        for path in sorted(pending)
    ][:10]

    evaluation = {
        "summary": (
            "Demo mode: an offline review, not a real one. A criterion counts as met when "
            f"the files it names no longer contain the starter {STARTER_MARKER} marker."
        ),
        "criteria": results,
        "findings": findings,
        "hints": [
            f"Replace each {STARTER_MARKER} in the files named by the criteria with your code."
        ],
    }

    return json.dumps(evaluation, ensure_ascii=False)


def roadmap_answer(messages: list[Message]) -> str:
    request = latest_request(messages)
    goal = " ".join(str(request.get("goal", "your goal")).split())

    titles = [
        ("understand-the-goal", "Describe the goal", "README.md"),
        ("build-the-core", "Build the core", "src/main.ts"),
        ("review-and-extend", "Review and extend", "src/main.ts"),
    ]

    steps = []
    previous: list[str] = []

    for step_id, title, path in titles:
        steps.append(
            {
                "id": step_id,
                "title": title,
                "concepts": ["demo"],
                "content": f"Demo mode: a placeholder step for “{goal[:200]}”.",
                "requires": previous,
                "challenge": {
                    "instructions": f"Edit {path} and remove its {STARTER_MARKER} marker.",
                    "criteria": [
                        {"id": f"{step_id}-written", "description": f"{path} has content."},
                        {
                            "id": f"{step_id}-finished",
                            "description": f"{path} has no {STARTER_MARKER} marker.",
                        },
                    ],
                },
                "sources": [],
            }
        )
        previous = [step_id]

    roadmap = {
        "title": f"Demo: {goal}"[:120],
        "description": "A placeholder roadmap from Papert's offline demo model.",
        "steps": steps,
        "starterFiles": [
            {"path": "README.md", "content": f"# {STARTER_MARKER}: describe the goal.\n"},
            {"path": "src/main.ts", "content": f"// {STARTER_MARKER}: build the core.\n"},
        ],
    }

    return json.dumps(roadmap, ensure_ascii=False)


def summary_answer(messages: list[Message]) -> str:
    request = latest_request(messages)
    previous = request.get("previous_summary") or {}
    folded = request.get("folded_turns") or []

    asked = [f"Asked: {str(turn.get('learner', ''))[:140]}" for turn in folded]
    covered = [*previous.get("covered", []), *asked][-4:]

    summary = {
        "covered": covered,
        "pending": previous.get("pending", [])[:6],
        "struggles": previous.get("struggles", [])[:4],
    }

    return json.dumps(summary, ensure_ascii=False)


class FakeModel:
    """A `Model` that answers every task Seymour runs, without network access."""

    def __init__(
        self,
        task: ModelTask,
        generation_observer: GenerationObserver,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.task = task
        self.generation_observer = generation_observer
        self.clock = clock
        self.output_limits = task.output_limits or OUTPUT_LIMITS

    def answer(self, messages: list[Message], tools: list[dict]) -> tuple[str, list[ToolCall]]:
        name = self.task.name

        if name == "tutor_guidance":
            return tutor_answer(messages, tools)
        if name == "attempt_evaluation":
            return evaluation_answer(messages), []
        if name == "roadmap_draft":
            return roadmap_answer(messages), []
        if name == "conversation_summary":
            return summary_answer(messages), []

        raise ValueError(f"The fake model has no answer for task {name}")

    def complete(self, messages, tools, effort, remaining, deadline, active) -> Message:
        if not active():
            raise TutorCancelled()
        if self.clock() >= deadline:
            raise ModelUnavailable("timeout")

        prompt = json.dumps(
            {
                "messages": [[message.role, message.content] for message in messages],
                "tools": tools,
            },
            ensure_ascii=False,
        )
        input_tokens = estimated_tokens(prompt)
        maximum_output = fitted_output(
            self.output_limits[effort], input_tokens, remaining, self.task
        )

        content, tool_calls = self.answer(messages, tools)

        output_tokens = min(estimated_tokens(content + json.dumps(tool_calls)), maximum_output)
        call = GenerationCall(
            provider="fake",
            model=FAKE_MODEL_NAME,
            effort=effort,
            input_tokens=input_tokens,
            input_exact=False,
            max_output=maximum_output,
            prompt=self.task.prompt.id,
            prompt_version=self.task.prompt.version,
        )

        with self.generation_observer(call) as generation:
            generation.usage(GenerationUsage(input_tokens, output_tokens, 0))

        return Message(
            role="assistant",
            content=content,
            tool_calls=tool_calls,
            usage={
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
            },
        )
