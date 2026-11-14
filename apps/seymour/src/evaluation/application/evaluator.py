"""Bounded multi-file evaluation graph. It reports findings; Core alone approves attempts."""

import json
from collections.abc import Callable
from functools import partial
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import ValidationError

from src.evaluation.application.prompts import EVALUATION_PROMPTS, REPAIR, SYSTEM
from src.evaluation.application.workspace_map import workspace_map
from src.evaluation.domain.evaluation import AnalysisContext, Evaluation, ModelEvaluation, bind
from src.shared.application.bounded_call import Stopped, bounded_call
from src.shared.domain.inference import Effort, Message, Model, ModelTask, final_text

MAX_MODEL_CALLS = 2
DEADLINE_SECONDS = 45


def evaluation_task() -> ModelTask:
    return ModelTask("attempt_evaluation", ModelEvaluation.model_json_schema(), EVALUATION_PROMPTS)


class AnalysisState(TypedDict):
    messages: list[Message]
    tokens: int
    calls: int
    evaluation: Evaluation | None
    reason: str
    stopped: bool


def summary_text(evaluation: Evaluation) -> str:
    met = sum(criterion.status == "met" for criterion in evaluation.criteria)
    total = len(evaluation.criteria)

    return (
        f"{evaluation.summary}\n\nSeymour found {met} of {total} criteria met. "
        "Papert records the official result for this attempt."
    )


def evaluation_request(context: AnalysisContext, progress: Callable[[str, int], None]) -> dict:
    progress("Seymour is mapping your files…", 0)

    payload = {
        "objective": context.objective[:500],
        "stepTitle": context.stepTitle[:200],
        "instructions": context.challenge.instructions,
        "criteria": [criterion.model_dump() for criterion in context.challenge.criteria],
        "syntax": {
            "checkedByPlatform": [entry.path for entry in context.syntax.checked],
            "notSyntaxChecked": context.syntax.unchecked,
        },
        "importMap": workspace_map(context.files),
        "files": {
            path: content for path, content in context.files.items() if not path.endswith("/")
        },
    }
    messages = [
        Message(role="system", content=SYSTEM),
        Message(role="user", content=json.dumps(payload, ensure_ascii=False)),
    ]

    return {"messages": messages}


def evaluate_attempt(
    state: AnalysisState,
    *,
    context: AnalysisContext,
    effort: Effort,
    budget: int,
    model: Model,
    active: Callable[[], bool],
    progress: Callable[[str, int], None],
    clock: Callable[[], float],
    deadline: float,
) -> dict:
    if not active():
        return {"stopped": True, "reason": "cancelled"}
    if clock() >= deadline:
        return {"stopped": True, "reason": "deadline"}

    first_call = state["calls"] == 0

    if first_call:
        progress("Seymour is checking each criterion…", state["tokens"])
    else:
        progress("Seymour is double-checking its review…", state["tokens"])

    # A repair attempt uses low effort so its smaller output reservation can still fit.
    call_effort = effort if first_call else "low"

    outcome = bounded_call(
        model,
        state["messages"],
        [],
        call_effort,
        budget - state["tokens"],
        deadline,
        active,
        clock,
    )

    if isinstance(outcome, Stopped):
        return {
            "tokens": state["tokens"] + outcome.charged,
            "stopped": True,
            "reason": outcome.reason,
        }

    response = outcome.response
    tokens = state["tokens"] + outcome.tokens
    calls = state["calls"] + 1

    try:
        result = ModelEvaluation.model_validate_json(final_text(response))
        evaluation = bind(result, context)
    except (ValidationError, ValueError) as error:
        if calls >= MAX_MODEL_CALLS:
            return {"tokens": tokens, "calls": calls, "stopped": True, "reason": "invalid"}

        # Only the validation category is echoed back, never learner content.
        problem = "schema" if isinstance(error, ValidationError) else "criteria"
        repair = Message(role="user", content=REPAIR.format(problem=problem))

        return {
            "messages": state["messages"] + [response, repair],
            "tokens": tokens,
            "calls": calls,
        }

    return {
        "tokens": tokens,
        "calls": calls,
        "evaluation": evaluation,
        "stopped": True,
        "reason": "evaluated",
    }


def run_analysis(
    context: AnalysisContext,
    effort: Effort,
    budget: int,
    model: Model,
    active: Callable[[], bool],
    progress: Callable[[str, int], None],
    *,
    clock: Callable[[], float],
) -> dict:
    if effort not in {"low", "medium", "high"}:
        raise ValueError("Unsupported analysis effort")
    if type(budget) is not int or not 1 <= budget <= 8000:
        raise ValueError("Invalid analysis budget")

    deadline = clock() + DEADLINE_SECONDS

    graph = StateGraph(AnalysisState)
    graph.add_node("map", lambda state: evaluation_request(context, progress))
    graph.add_node(
        "evaluate",
        partial(
            evaluate_attempt,
            context=context,
            effort=effort,
            budget=budget,
            model=model,
            active=active,
            progress=progress,
            clock=clock,
            deadline=deadline,
        ),
    )
    graph.add_edge(START, "map")
    graph.add_edge("map", "evaluate")
    graph.add_conditional_edges("evaluate", lambda state: END if state["stopped"] else "evaluate")

    return graph.compile().invoke(
        {
            "messages": [],
            "tokens": 0,
            "calls": 0,
            "evaluation": None,
            "reason": "",
            "stopped": False,
        },
        {"recursion_limit": 6, "callbacks": []},
    )
