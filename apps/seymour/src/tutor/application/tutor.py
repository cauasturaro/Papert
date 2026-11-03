"""A bounded tutor graph. Only Core decides mode eligibility and progression."""

import json
import time
from collections.abc import Callable
from typing import Literal, Protocol, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langsmith import tracing_context

from src.retrieval.application.grounding import grounding
from src.retrieval.domain.ports import Search
from src.tutor.application.conversation import recent_turns, search_query
from src.tutor.application.guidance import Guidance, render
from src.tutor.application.prompts import system_prompt
from src.tutor.application.tools import call_tool, tool_definitions
from src.tutor.domain.context import ToolResult, TutorContext


class BudgetExceeded(Exception):
    pass


class TutorCancelled(Exception):
    pass


class TutorModel(Protocol):
    def complete(
        self,
        messages: list[BaseMessage],
        tools: list[dict],
        effort: str,
        remaining: int,
        deadline: float,
        active: Callable[[], bool],
    ) -> AIMessage: ...


class State(TypedDict):
    messages: list[BaseMessage]
    tokens: int
    calls: int
    text: str
    stopped: bool


def final_text(response: AIMessage) -> str:
    """Use only the last final-answer message when the Responses API returns several phases."""
    final_blocks = [
        block
        for block in response.content
        if isinstance(block, dict) and block.get("phase") == "final_answer"
    ]
    if not final_blocks:
        return response.text

    final_message_id = final_blocks[-1].get("id")

    return "".join(
        block["text"]
        for block in final_blocks
        if block.get("type") == "text"
        and (not final_message_id or block.get("id") == final_message_id)
    )


def run_tutor(
    context: TutorContext,
    prompt: str,
    mode: Literal["doubt", "teaching", "solution", "review"],
    effort: Literal["low", "medium", "high"],
    solution_allowed: bool,
    budget: int,
    model: TutorModel,
    active: Callable[[], bool],
    progress: Callable[[str, int], None],
    observe_tool: Callable[[str, Callable[[], ToolResult]], ToolResult],
    search: Search | None = None,
) -> State:
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

    system = system_prompt(mode, bool(context.sources), bool(context.recentTurns))
    working = context.working_context(4000)
    request = {"request": prompt, "working_context": working}

    if context.recentTurns:
        request["recent_turns"] = recent_turns(context)

    # Every excerpt shown to the model in this run; quotes and cites are checked against it.
    retrieved: list[dict] = []

    if context.sources and search is not None:
        progress("Seymour is searching your sources…", 0)

        # Best effort: the search_sources tool remains if this lookup fails.
        try:
            filenames = {source.id: source.filename for source in context.sources}
            query = search_query(context, prompt)
            excerpts = grounding(filenames, context.sourceIds, query, search)
        except Exception:
            excerpts = []

        request["source_excerpts"] = [
            {"cite": excerpt["cite"], "text": excerpt["text"]} for excerpt in excerpts
        ]
        retrieved.extend(excerpts)

    messages = [
        SystemMessage(content=system),
        HumanMessage(content=json.dumps(request)),
    ]
    deadline = time.monotonic() + 20

    def infer(state: State):
        if not active():
            return {"stopped": True, "text": ""}
        if time.monotonic() >= deadline or state["calls"] >= 3:
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

        usage = response.usage_metadata
        if not usage or usage["total_tokens"] > budget - state["tokens"]:
            raise RuntimeError("Model usage is missing or exceeds the admitted budget")

        tokens = state["tokens"] + usage["total_tokens"]
        updated = state["messages"] + [response]
        if response.tool_calls:
            return {"messages": updated, "tokens": tokens, "calls": state["calls"] + 1}

        guidance_text = final_text(response)

        try:
            guidance = Guidance.model_validate_json(guidance_text)
            text = render(guidance, retrieved)
            if len(text.encode("utf-16-le")) > 8000:
                raise ValueError("Guidance exceeds the transport limit")
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
        }

    def tools(state: State):
        response = state["messages"][-1]
        if len(response.tool_calls) > 4:
            return {"stopped": True, "text": "Tool limit reached. Ask about one file or criterion."}

        results = []
        for call in response.tool_calls:
            if not active():
                return {"stopped": True, "text": ""}
            if time.monotonic() >= deadline:
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
                ToolMessage(
                    content=result.model_dump_json(), tool_call_id=call["id"], name=call["name"]
                )
            )

        searched = any(call["name"] == "search_sources" for call in response.tool_calls)
        status = (
            "Seymour is searching your sources…"
            if searched
            else "Seymour is checking the saved context…"
        )
        progress(status, state["tokens"])

        return {"messages": state["messages"] + results}

    graph = StateGraph(State)
    graph.add_node("model", infer)
    graph.add_node("tools", tools)
    graph.add_edge(START, "model")
    graph.add_conditional_edges("model", lambda state: END if state["stopped"] else "tools")
    graph.add_conditional_edges("tools", lambda state: END if state["stopped"] else "model")

    with tracing_context(enabled=False):
        return graph.compile().invoke(
            {"messages": messages, "tokens": 0, "calls": 0, "text": "", "stopped": False},
            {"recursion_limit": 8, "callbacks": []},
        )
