"""Bounded roadmap generation graph: read sources, draft, validate, repair once."""

import json
from collections.abc import Callable
from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import ValidationError

from src.retrieval import EXCERPT_CHARACTERS, GROUNDING_DISTANCE, cited_excerpts
from src.retrieval.domain.ports import Search
from src.roadmap.application.prompts import LEVELS, REPAIR, SYSTEM
from src.roadmap.domain.roadmap import GenerationContext, ModelRoadmap, RoadmapRuleError, bind
from src.shared.inference import BudgetExceeded, Message, Model, TutorCancelled, final_text

GENERATION_BUDGET = 16000
MAX_MODEL_CALLS = 2
# Must finish inside Core's 60-second lease.
DEADLINE_SECONDS = 50
EXCERPTS_PER_SOURCE = 2
MAX_EXCERPTS = 6
EXCERPT_TOTAL_CHARACTERS = 7200


class GenerationState(TypedDict):
    messages: list[Message]
    tokens: int
    calls: int
    excerpts: list[dict]
    roadmap: dict | None
    reason: str
    stopped: bool


def pertinent_excerpts(context: GenerationContext, search: Search | None) -> list[dict]:
    """Passages clearly related to the goal, at most two per source, within a size cap."""
    if not context.sources or search is None:
        return []

    filenames = {source.id: source.filename for source in context.sources}
    passages, _tokens = search(context.goal, list(filenames))

    related = [
        passage
        for passage in passages
        if passage["distance"] is not None and passage["distance"] <= GROUNDING_DISTANCE
    ]

    kept = []
    per_source: dict[str, int] = {}
    total = 0

    for excerpt in cited_excerpts(filenames, related, EXCERPT_CHARACTERS):
        source_id = excerpt["sourceId"]

        if per_source.get(source_id, 0) >= EXCERPTS_PER_SOURCE:
            continue

        if len(kept) >= MAX_EXCERPTS or total + len(excerpt["text"]) > EXCERPT_TOTAL_CHARACTERS:
            break

        per_source[source_id] = per_source.get(source_id, 0) + 1
        total += len(excerpt["text"])
        kept.append(excerpt)

    return kept


def summary_text(roadmap: dict) -> str:
    definition = roadmap["definition"]
    count = len(definition["steps"])

    return (
        f"Seymour drafted “{definition['title']}” with {count} steps. "
        "Papert checks it before saving your roadmap."
    )


def run_generation(
    context: GenerationContext,
    effort: Literal["low", "medium", "high"],
    budget: int,
    model: Model,
    active: Callable[[], bool],
    progress: Callable[[str, int], None],
    search: Search | None = None,
    *,
    clock: Callable[[], float],
) -> GenerationState:
    if effort not in {"low", "medium", "high"}:
        raise ValueError("Unsupported generation effort")
    if type(budget) is not int or not 1 <= budget <= GENERATION_BUDGET:
        raise ValueError("Invalid generation budget")

    deadline = clock() + DEADLINE_SECONDS

    def read_sources(state: GenerationState):
        if context.sources:
            progress("Seymour is reading your sources…", 0)

        # Best effort: a failed lookup drafts without excerpts instead of failing the job.
        try:
            excerpts = pertinent_excerpts(context, search)
        except Exception:
            excerpts = []

        request = {
            "goal": context.goal,
            "level": context.level,
            "level_guidance": LEVELS[context.level],
        }

        if excerpts:
            request["source_excerpts"] = [
                {"cite": excerpt["cite"], "text": excerpt["text"]} for excerpt in excerpts
            ]

        messages = [
            Message(role="system", content=SYSTEM),
            Message(role="user", content=json.dumps(request, ensure_ascii=False)),
        ]

        return {"messages": messages, "excerpts": excerpts}

    def draft(state: GenerationState):
        if not active():
            return {"stopped": True, "reason": "cancelled"}
        if clock() >= deadline:
            return {"stopped": True, "reason": "deadline"}

        progress(
            "Seymour is drafting your roadmap…"
            if state["calls"] == 0
            else "Seymour is correcting the roadmap…",
            state["tokens"],
        )

        try:
            response = model.complete(
                state["messages"],
                [],
                effort if state["calls"] == 0 else "low",
                budget - state["tokens"],
                deadline,
                active,
            )
        except TutorCancelled:
            return {"stopped": True, "reason": "cancelled"}
        except BudgetExceeded:
            return {"stopped": True, "reason": "budget"}
        except TimeoutError:
            return {"stopped": True, "reason": "deadline"}

        usage = response.usage
        if not usage or usage["total_tokens"] > budget - state["tokens"]:
            raise RuntimeError("Model usage is missing or exceeds the admitted budget")

        tokens = state["tokens"] + usage["total_tokens"]
        calls = state["calls"] + 1

        try:
            result = ModelRoadmap.model_validate_json(final_text(response))
            roadmap = bind(result, context, state["excerpts"])
        except (ValidationError, RoadmapRuleError) as error:
            if calls >= MAX_MODEL_CALLS:
                return {"tokens": tokens, "calls": calls, "stopped": True, "reason": "invalid"}

            # Schema errors are summarized by category; rule messages are our own text.
            problem = (
                str(error)
                if isinstance(error, RoadmapRuleError)
                else "it did not match the response schema."
            )

            # A fresh request (not the rejected answer) keeps the repair inside the budget.
            repair = Message(role="user", content=REPAIR.format(problem=problem))

            return {
                "messages": state["messages"][:2] + [repair],
                "tokens": tokens,
                "calls": calls,
            }

        return {
            "tokens": tokens,
            "calls": calls,
            "roadmap": roadmap,
            "stopped": True,
            "reason": "generated",
        }

    graph = StateGraph(GenerationState)
    graph.add_node("read_sources", read_sources)
    graph.add_node("draft", draft)
    graph.add_edge(START, "read_sources")
    graph.add_edge("read_sources", "draft")
    graph.add_conditional_edges("draft", lambda state: END if state["stopped"] else "draft")

    return graph.compile().invoke(
        {
            "messages": [],
            "tokens": 0,
            "calls": 0,
            "excerpts": [],
            "roadmap": None,
            "reason": "",
            "stopped": False,
        },
        {"recursion_limit": 6, "callbacks": []},
    )
