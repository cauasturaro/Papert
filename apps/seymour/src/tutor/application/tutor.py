"""A bounded tutor graph. Only Core decides mode eligibility and progression."""

from collections.abc import Callable
from dataclasses import asdict
from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from src.retrieval.application.grounding import grounding
from src.retrieval.domain.ports import Search
from src.shared.domain.inference import (
    BudgetExceeded,
    Message,
    Model,
    ModelUnavailable,
    TutorCancelled,
    final_text,
)
from src.tutor.application.conversation import search_query
from src.tutor.application.guidance import Guidance, render
from src.tutor.application.guidance import grounding as answer_grounding
from src.tutor.application.prompts import system_prompt
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


UNAVAILABLE_TEXT = (
    "Seymour's AI models are not responding right now. Nothing in your workspace changed, "
    "and only the tokens the failed calls may have used were charged. Try again in a minute."
)

# Checkpoint steps: 1 after the summary, then 1 + calls after every tool round.
SUMMARY_STEP = 1

Save = Callable[[int, dict], None]


def _current_summary(
    context: TutorContext,
    summarizer: Model | None,
    budget: int,
    deadline: float,
    active: Callable[[], bool],
    resume: dict,
) -> tuple[SummaryContent | None, int, dict]:
    """The summary to show this run (folded now, restored from a checkpoint or Core's), the
    tokens this attempt spent on it and trace-safe facts about how it was obtained."""
    if context.foldTurns and "summary" in resume:
        restored = resume["summary"]
        content = SummaryContent.model_validate(restored) if restored else None

        return content, 0, {"summarized": True, "summaryFallback": False}

    if context.foldTurns:
        content, tokens, fallback = summarize(context, summarizer, budget, deadline, active)

        return content, tokens, {"summarized": True, "summaryFallback": fallback}

    if context.summary is not None:
        content = SummaryContent(
            covered=context.summary.covered,
            pending=context.summary.pending,
            struggles=context.summary.struggles,
        )

        return content, 0, {"summarized": False, "summaryFallback": False}

    return None, 0, {"summarized": False, "summaryFallback": False}


def run_tutor(
    context: TutorContext,
    prompt: str,
    mode: Literal["doubt", "teaching", "solution", "review"],
    effort: Literal["low", "medium", "high"],
    solution_allowed: bool,
    budget: int,
    model: Model,
    active: Callable[[], bool],
    progress: Callable[[str, int], None],
    observe_tool: Callable[[str, Callable[[], ToolResult]], ToolResult],
    search: Search | None = None,
    *,
    clock: Callable[[], float],
    summarizer: Model | None = None,
    resume: dict | None = None,
    save: Save | None = None,
) -> dict:
    if mode not in {"doubt", "teaching", "solution", "review"} or effort not in {
        "low",
        "medium",
        "high",
    }:
        raise ValueError("Unsupported tutor settings")
    if mode == "solution" and not solution_allowed:
        raise ValueError("Solution guidance is not authorized")
    if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 2000:
        raise ValueError("Invalid tutor prompt")
    if type(budget) is not int or not 1 <= budget <= 8000:
        raise ValueError("Invalid tutor budget")

    resume = resume or {}
    deadline = clock() + 20

    def checkpoint(step: int, state: dict) -> None:
        if save is not None:
            save(step, state)

    # L2 compaction runs first so the answer sees the merged summary.
    folding = bool(context.foldTurns) and "summary" not in resume
    if folding:
        progress("Seymour is reviewing the earlier conversation…", 0)

    summary, summary_tokens, summary_facts = _current_summary(
        context, summarizer, budget, deadline, active, resume
    )
    new_summary = summary.model_dump() if context.foldTurns and summary else None

    if folding:
        checkpoint(SUMMARY_STEP, {"summary": new_summary})

    has_history = bool(context.recentTurns) or summary is not None
    system = system_prompt(mode, bool(context.sources), has_history, bool(context.memory))

    # Every excerpt shown to the model in this run; quotes and cites are checked against it.
    retrieved: list[dict] = list(resume.get("retrieved", []))
    excerpts = None

    if "messages" not in resume and context.sources and search is not None:
        progress("Seymour is searching your sources…", summary_tokens)

        # Best effort: the search_sources tool remains if this lookup fails.
        try:
            filenames = {source.id: source.filename for source in context.sources}
            query = search_query(context, prompt)
            excerpts = grounding(filenames, context.sourceIds, query, search)
        except Exception:
            excerpts = []

        retrieved.extend(excerpts)

    if "messages" in resume:
        messages = [Message(**message) for message in resume["messages"]]
    else:
        messages = [
            Message(role="system", content=system),
            Message(role="user", content=tutor_request(context, prompt, summary, excerpts)),
        ]

    def infer(state: State):
        if not active():
            return {"stopped": True, "text": ""}
        if clock() >= deadline or state["calls"] >= 3:
            return {
                "stopped": True,
                "text": "Tutor limit reached. Narrow the question and try again.",
            }

        try:
            response = model.complete(
                state["messages"],
                tool_definitions(context) if state["calls"] < 2 else [],
                effort,
                budget - state["tokens"],
                deadline,
                active,
            )
        except TutorCancelled:
            return {"stopped": True, "text": ""}
        except BudgetExceeded:
            return {
                "stopped": True,
                "text": "Context exceeds this attempt's token budget. Narrow the selection or question.",
            }
        except ModelUnavailable as failure:
            return {
                "tokens": state["tokens"] + failure.charged,
                "stopped": True,
                "text": UNAVAILABLE_TEXT,
                "unavailable": True,
            }

        usage = response.usage
        if not usage or usage["total_tokens"] > budget - state["tokens"]:
            raise RuntimeError("Model usage is missing or exceeds the admitted budget")

        tokens = state["tokens"] + usage["total_tokens"]
        updated = state["messages"] + [response]
        if response.tool_calls:
            return {"messages": updated, "tokens": tokens, "calls": state["calls"] + 1}

        guidance_text = final_text(response)
        sources = None
        suggestion = None

        try:
            guidance = Guidance.model_validate_json(guidance_text)
            text, citations = render(guidance, retrieved, prompt)
            if len(text.encode("utf-16-le")) > 8000:
                raise ValueError("Guidance exceeds the transport limit")

            sources = answer_grounding(bool(context.sources), citations)
            suggestion = proposal(guidance.remember_kind, guidance.remember_text)
        except (ValueError, TypeError):
            text = (
                "The tutor could not produce valid guidance. Please narrow the question and retry."
            )

        return {
            "messages": updated,
            "tokens": tokens,
            "calls": state["calls"] + 1,
            "text": text,
            "stopped": True,
            "grounding": sources,
            "proposal": suggestion,
        }

    def tools(state: State):
        response = state["messages"][-1]
        if len(response.tool_calls) > 4:
            return {"stopped": True, "text": "Tool limit reached. Ask about one file or criterion."}

        results = []
        for call in response.tool_calls:
            if not active():
                return {"stopped": True, "text": ""}
            if clock() >= deadline:
                return {
                    "stopped": True,
                    "text": "Tutor limit reached. Narrow the question and try again.",
                }

            result = observe_tool(
                call["name"],
                lambda call=call: call_tool(context, call["name"], call["args"], search),
            )

            if result.kind == "sources":
                retrieved.extend(result.data["excerpts"])

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
        progress(status, state["tokens"])

        messages = state["messages"] + results
        checkpoint(
            SUMMARY_STEP + state["calls"],
            {
                "summary": new_summary,
                "messages": [asdict(message) for message in messages],
                "calls": state["calls"],
                "retrieved": retrieved,
            },
        )

        return {"messages": messages}

    graph = StateGraph(State)
    graph.add_node("model", infer)
    graph.add_node("tools", tools)
    graph.add_edge(START, "model")
    graph.add_conditional_edges("model", lambda state: END if state["stopped"] else "tools")
    graph.add_conditional_edges("tools", lambda state: END if state["stopped"] else "model")

    final = graph.compile().invoke(
        {
            "messages": messages,
            "tokens": summary_tokens,
            # Carried over on resume so the three-call limit holds across attempts.
            "calls": resume.get("calls", 0),
            "text": "",
            "stopped": False,
            "grounding": None,
            "proposal": None,
            "unavailable": False,
        },
        {"recursion_limit": 8, "callbacks": []},
    )

    return {
        **final,
        **summary_facts,
        "summary": new_summary,
        "retrieved": retrieved,
        "resumed": bool(resume),
    }
