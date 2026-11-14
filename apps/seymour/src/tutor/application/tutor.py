from collections.abc import Callable
from typing import Literal

from langgraph.graph import END, START, StateGraph

from src.retrieval.domain.ports import Search
from src.shared.domain.inference import Model
from src.tutor.application.tutor_graph import (
    DEADLINE_SECONDS,
    Save,
    State,
    TutorGraph,
    prepare_tutor_run,
)
from src.tutor.domain.context import ToolResult, TutorContext


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
    run = TutorGraph(
        context,
        prompt,
        mode,
        effort,
        budget,
        model,
        active,
        progress,
        observe_tool,
        search,
        clock,
        summarizer,
        resume,
        save,
        clock() + DEADLINE_SECONDS,
    )
    messages, summary_tokens = prepare_tutor_run(run)

    graph = StateGraph(State)
    graph.add_node("model", run.infer)
    graph.add_node("tools", run.tools)
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
            "failure": None,
        },
        {"recursion_limit": 8, "callbacks": []},
    )

    return {
        **final,
        **run.summary_facts,
        "summary": run.new_summary,
        "retrieved": run.retrieved,
        "resumed": bool(resume),
    }
