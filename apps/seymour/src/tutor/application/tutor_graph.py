"""A bounded tutor graph. Only Core decides mode eligibility and progression."""

from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from typing import TypedDict

from src.retrieval.application.grounding import grounding
from src.retrieval.domain.ports import Search
from src.shared.application.bounded_call import Stopped, bounded_call
from src.shared.domain.inference import Message, Model, final_text
from src.tutor.application.conversation import search_query
from src.tutor.application.guidance import Guidance, render, sources_needed
from src.tutor.application.guidance import grounding as answer_grounding
from src.tutor.application.prompts import FINAL_CALL_NOTE, system_prompt
from src.tutor.application.request import tutor_request
from src.tutor.application.summary import summarize
from src.tutor.application.tools import call_tool, tool_definitions
from src.tutor.domain.context import ToolResult, TutorContext
from src.tutor.domain.memory import SummaryContent, proposal


class State(TypedDict):
    messages: list[Message]
    tokens: int
    calls: int
    text: str
    stopped: bool
    # Set only for valid guidance: support and citations of the learner's sources.
    grounding: dict | None
    # A filtered durable-note proposal from valid guidance.
    proposal: dict | None
    # Every provider failed; the execution ends as failed instead of answering.
    unavailable: bool
    # Why the run ended without guidance; such outcomes are failures, never conversation turns.
    failure: str | None


UNAVAILABLE_TEXT = (
    "Seymour can't reach its AI models right now. Nothing in your workspace changed. "
    "Try again in a minute."
)

# Learner copy for runs that stop without valid guidance.
FAILURE_TEXT = {
    "limit": "Seymour ran out of time on this question. Try asking about one file or one part of it.",
    "budget": (
        "This question needs more context than Seymour can read at once. "
        "Select less code or ask about one part of it."
    ),
    "tools": "Seymour tried to look at too much at once. Ask about one file or one criterion.",
    "invalid": "Seymour couldn't put together a clear answer. Try rephrasing the question.",
}


def _failed(reason: str) -> dict:
    return {"stopped": True, "text": FAILURE_TEXT[reason], "failure": reason}


def _stopped(outcome: Stopped, tokens: int) -> dict:
    charged = tokens + outcome.charged

    if outcome.reason == "cancelled":
        return {"stopped": True, "text": "", "tokens": charged}
    if outcome.reason == "budget":
        return {**_failed("budget"), "tokens": charged}
    if outcome.reason == "deadline":
        return {**_failed("limit"), "tokens": charged}

    return {
        "tokens": charged,
        "stopped": True,
        "text": UNAVAILABLE_TEXT,
        "unavailable": True,
        "failure": "unavailable",
    }


# Covers the summary, retrieval and every model call; must finish inside Core's 60-second lease.
DEADLINE_SECONDS = 45

# Checkpoint steps: 1 after the summary, then 1 + calls after every tool round.
SUMMARY_STEP = 1

Save = Callable[[int, dict], None]


def _current_summary(
    context: TutorContext,
    summarizer: Model | None,
    budget: int,
    deadline: float,
    active: Callable[[], bool],
    clock: Callable[[], float],
    resume: dict,
) -> tuple[SummaryContent | None, int, dict]:
    """The summary to show this run (folded now, restored from a checkpoint or Core's), the
    tokens this attempt spent on it and trace-safe facts about how it was obtained."""
    if context.foldTurns and "summary" in resume:
        restored = resume["summary"]
        content = SummaryContent.model_validate(restored) if restored else None

        return content, 0, {"summarized": True, "summaryFallback": False}

    if context.foldTurns:
        content, tokens, fallback = summarize(context, summarizer, budget, deadline, active, clock)

        return content, tokens, {"summarized": True, "summaryFallback": fallback}

    if context.summary is not None:
        content = SummaryContent(
            covered=context.summary.covered,
            pending=context.summary.pending,
            struggles=context.summary.struggles,
        )

        return content, 0, {"summarized": False, "summaryFallback": False}

    return None, 0, {"summarized": False, "summaryFallback": False}


@dataclass
class TutorGraph:
    context: TutorContext
    prompt: str
    mode: str
    effort: str
    budget: int
    model: Model
    active: Callable[[], bool]
    progress: Callable[[str, int], None]
    observe_tool: Callable[[str, Callable[[], ToolResult]], ToolResult]
    search: Search | None
    clock: Callable[[], float]
    summarizer: Model | None
    resume: dict
    save: Save | None
    deadline: float
    new_summary: dict | None = None
    summary_facts: dict = field(default_factory=dict)
    retrieved: list[dict] = field(default_factory=list)

    def checkpoint(self, step: int, state: dict) -> None:
        if self.save is not None:
            self.save(step, state)

    def infer(self, state: State) -> dict:
        if not self.active():
            return {"stopped": True, "text": ""}
        if self.clock() >= self.deadline or state["calls"] >= 3:
            return _failed("limit")

        tools_left = state["calls"] < 2
        request = state["messages"]

        if not tools_left:
            request = [*request, Message(role="user", content=FINAL_CALL_NOTE)]

        outcome = bounded_call(
            self.model,
            request,
            tool_definitions(self.context) if tools_left else [],
            self.effort,
            self.budget - state["tokens"],
            self.deadline,
            self.active,
            self.clock,
        )

        if isinstance(outcome, Stopped):
            return _stopped(outcome, state["tokens"])

        response = outcome.response
        tokens = state["tokens"] + outcome.tokens
        updated = state["messages"] + [response]
        if response.tool_calls:
            return {"messages": updated, "tokens": tokens, "calls": state["calls"] + 1}

        guidance_text = final_text(response)

        try:
            guidance = Guidance.model_validate_json(guidance_text)
            text, citations = render(guidance, self.retrieved, self.prompt)
            if len(text.encode("utf-16-le")) > 8000:
                raise ValueError("Guidance exceeds the transport limit")
        except (ValueError, TypeError):
            return {
                **_failed("invalid"),
                "messages": updated,
                "tokens": tokens,
                "calls": state["calls"] + 1,
            }

        # A claimed but unverified cite still deserves the "not supported" note.
        needed = sources_needed(self.context, state["messages"]) or bool(guidance.sources)
        sources = answer_grounding(bool(self.context.sources), citations, needed)
        suggestion = proposal(guidance.remember_kind, guidance.remember_text)

        return {
            "messages": updated,
            "tokens": tokens,
            "calls": state["calls"] + 1,
            "text": text,
            "stopped": True,
            "grounding": sources,
            "proposal": suggestion,
        }

    def tools(self, state: State) -> dict:
        response = state["messages"][-1]
        if len(response.tool_calls) > 4:
            return _failed("tools")

        results = []
        for call in response.tool_calls:
            if not self.active():
                return {"stopped": True, "text": ""}
            if self.clock() >= self.deadline:
                return _failed("limit")

            result = self.observe_tool(
                call["name"],
                lambda call=call: call_tool(self.context, call["name"], call["args"], self.search),
            )

            if result.kind == "sources":
                self.retrieved.extend(result.data["excerpts"])

            results.append(
                Message(
                    role="tool",
                    content=result.model_dump_json(),
                    tool_call_id=call["id"],
                    name=call["name"],
                )
            )

        searched = any(call["name"] == "search_sources" for call in response.tool_calls)
        status = (
            "Seymour is searching your sources…"
            if searched
            else "Seymour is checking the saved context…"
        )
        self.progress(status, state["tokens"])

        messages = state["messages"] + results
        self.checkpoint(
            SUMMARY_STEP + state["calls"],
            {
                "summary": self.new_summary,
                "messages": [asdict(message) for message in messages],
                "calls": state["calls"],
                "retrieved": self.retrieved,
            },
        )

        return {"messages": messages}


def prepare_tutor_run(run: TutorGraph) -> tuple[list[Message], int]:
    # L2 compaction runs first so the answer sees the merged summary.
    folding = bool(run.context.foldTurns) and "summary" not in run.resume
    if folding:
        run.progress("Seymour is reviewing the earlier conversation…", 0)

    summary, summary_tokens, run.summary_facts = _current_summary(
        run.context, run.summarizer, run.budget, run.deadline, run.active, run.clock, run.resume
    )
    run.new_summary = summary.model_dump() if run.context.foldTurns and summary else None

    if folding:
        run.checkpoint(SUMMARY_STEP, {"summary": run.new_summary})

    has_history = bool(run.context.recentTurns) or summary is not None
    system = system_prompt(
        run.mode, bool(run.context.sources), has_history, bool(run.context.memory)
    )

    # Every excerpt shown to the model in this run; quotes and cites are checked against it.
    run.retrieved = list(run.resume.get("retrieved", []))
    excerpts = None

    if "messages" not in run.resume and run.context.sources and run.search is not None:
        run.progress("Seymour is searching your sources…", summary_tokens)

        # Best effort: the search_sources tool remains if this lookup fails.
        try:
            filenames = {source.id: source.filename for source in run.context.sources}
            query = search_query(run.context, run.prompt)
            excerpts = grounding(filenames, run.context.sourceIds, query, run.search)
        except Exception:
            excerpts = []

        run.retrieved.extend(excerpts)

    if "messages" in run.resume:
        messages = [Message(**message) for message in run.resume["messages"]]
    else:
        messages = [
            Message(role="system", content=system),
            Message(role="user", content=tutor_request(run.context, run.prompt, summary, excerpts)),
        ]

    return messages, summary_tokens
