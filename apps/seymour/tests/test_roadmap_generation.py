import json
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.executions.application.ports import ExecutionResources
from src.executions.application.workflows import run_generation_job
from src.executions.domain.execution import Claim, Result
from src.executions.infrastructure.contracts import encode_result
from src.roadmap.application.generator import (
    GENERATION_BUDGET,
    pertinent_excerpts,
    run_generation,
)
from src.roadmap.domain.roadmap import (
    GenerationContext,
    ModelRoadmap,
    RoadmapRuleError,
    bind,
)
from src.shared.inference import BudgetExceeded, Message

NOTES = str(uuid4())
OTHER = str(uuid4())
USAGE = {"input_tokens": 2000, "output_tokens": 3000, "total_tokens": 5000}


def context(sources=()):
    return GenerationContext(
        sessionId="session",
        workspaceId=str(uuid4()),
        goal="Learn hexagonal architecture with NestJS for a store backend",
        level="intermediate",
        sources=[
            {"id": source_id, "filename": filename, "format": "md"}
            for source_id, filename in sources
        ],
    )


def step(step_id, requires=(), sources=()):
    return {
        "id": step_id,
        "title": f"Step {step_id}",
        "concepts": ["ports"],
        "content": "Explain the concept.",
        "requires": list(requires),
        "challenge": {
            "instructions": "Write the port.",
            "criteria": [
                {"id": "port-file", "description": "src/ports/catalog.ts declares a port."},
                {"id": "no-framework", "description": "The port imports no framework."},
            ],
        },
        "sources": list(sources),
    }


def roadmap_json(steps=None, files=None):
    payload = {
        "title": "Hexagonal NestJS",
        "description": "Build a store backend with ports and adapters.",
        "steps": steps or [step("domain"), step("ports", ["domain"]), step("adapters", ["ports"])],
        "starterFiles": files or [{"path": "src/main.ts", "content": "// TODO\n"}],
    }

    return json.dumps(payload)


def response(content, usage=USAGE):
    return Message(role="assistant", content=content, usage=usage)


EXCERPT = {
    "sourceId": NOTES,
    "cite": "notes.md, lines 1-6",
    "location": {"lineStart": 1, "lineEnd": 6},
    "start": 0,
    "text": "Ports live in src/core/ports.",
}


def run(model, ctx=None, search=None, active=lambda: True):
    progress = []

    result = run_generation(
        ctx or context(),
        "low",
        GENERATION_BUDGET,
        model,
        active,
        lambda text, tokens: progress.append(text),
        search,
        clock=lambda: 0.0,
    )

    return result, progress


def test_bind_produces_core_definition_and_keeps_only_given_cites():
    result = ModelRoadmap.model_validate_json(
        roadmap_json(
            steps=[
                step("domain", sources=["notes.md, lines 1-6", "invented.pdf, p. 9"]),
                step("ports", ["domain"]),
                step("adapters", ["ports"]),
            ]
        )
    )

    bound = bind(result, context([(NOTES, "notes.md")]), [EXCERPT])

    definition = bound["definition"]
    assert definition["level"] == "intermediate"
    assert definition["starterFiles"] == {"src/main.ts": "// TODO\n"}
    assert definition["steps"][1]["requires"] == ["domain"]
    assert "sources" not in definition["steps"][0]
    assert bound["evidence"] == [
        {
            "stepId": "domain",
            "sourceId": NOTES,
            "cite": "notes.md, lines 1-6",
            "location": {"lineStart": 1, "lineEnd": 6},
        }
    ]


@pytest.mark.parametrize(
    ("steps", "files", "message"),
    [
        ([step("a"), step("a"), step("b")], None, "used twice"),
        ([step("a", ["b"]), step("b"), step("c")], None, "not an earlier step"),
        ([step("a", ["a"]), step("b"), step("c")], None, "not an earlier step"),
        (None, [{"path": "../secret", "content": ""}], "Starter files"),
        (
            None,
            [{"path": "a.ts", "content": ""}, {"path": "a.ts", "content": ""}],
            "unique",
        ),
    ],
)
def test_bind_rejects_rule_violations(steps, files, message):
    result = ModelRoadmap.model_validate_json(roadmap_json(steps, files))

    with pytest.raises(RoadmapRuleError, match=message):
        bind(result, context(), [])


def test_valid_draft_finishes_in_one_call():
    model = MagicMock()
    model.complete.return_value = response(roadmap_json())

    result, progress = run(model)

    assert result["reason"] == "generated"
    assert result["calls"] == 1
    assert result["tokens"] == 5000
    assert len(result["roadmap"]["definition"]["steps"]) == 3
    assert progress == ["Seymour is drafting your roadmap…"]


def test_rule_violation_gets_one_fresh_repair_with_our_own_message():
    model = MagicMock()
    broken = roadmap_json([step("a", ["c"]), step("b"), step("c")])
    model.complete.side_effect = [response(broken), response(roadmap_json())]

    result, _progress = run(model)

    assert result["reason"] == "generated"
    assert result["calls"] == 2

    repair_messages = model.complete.call_args_list[1].args[0]
    assert len(repair_messages) == 3
    assert "requires 'c'" in repair_messages[-1].content
    assert model.complete.call_args_list[1].args[2] == "low"


def test_two_invalid_drafts_stop_without_a_roadmap():
    model = MagicMock()
    model.complete.return_value = response('{"title": "incomplete"}')

    result, _progress = run(model)

    assert result["reason"] == "invalid"
    assert result["roadmap"] is None
    assert result["calls"] == 2
    assert result["tokens"] == 10000


def test_cancellation_and_budget_stop_before_or_during_inference():
    model = MagicMock()

    cancelled, _progress = run(model, active=lambda: False)

    assert cancelled["reason"] == "cancelled"
    model.complete.assert_not_called()

    model.complete.side_effect = BudgetExceeded()

    exhausted, _progress = run(model)

    assert exhausted["reason"] == "budget"
    assert exhausted["roadmap"] is None


def test_usage_above_the_admitted_budget_fails_the_attempt():
    model = MagicMock()
    over = {
        "input_tokens": 1,
        "output_tokens": GENERATION_BUDGET,
        "total_tokens": GENERATION_BUDGET + 1,
    }
    model.complete.return_value = response(roadmap_json(), over)

    with pytest.raises(RuntimeError, match="admitted budget"):
        run(model)


def test_rejects_unknown_effort_and_budget():
    with pytest.raises(ValueError):
        run_generation(context(), "max", 100, MagicMock(), lambda: True, print, clock=lambda: 0.0)

    with pytest.raises(ValueError):
        run_generation(
            context(),
            "low",
            GENERATION_BUDGET + 1,
            MagicMock(),
            lambda: True,
            print,
            clock=lambda: 0.0,
        )


def passage(document_id, ordinal, distance, content="text"):
    return {
        "documentId": document_id,
        "ordinal": ordinal,
        "start": 0,
        "content": content,
        "location": {"lineStart": ordinal + 1, "lineEnd": ordinal + 2},
        "distance": distance,
    }


def test_pertinent_excerpts_cap_each_source_and_drop_unrelated_passages():
    passages = [
        passage(NOTES, 0, 0.2),
        passage(NOTES, 1, 0.3),
        passage(NOTES, 2, 0.4),
        passage(OTHER, 0, 0.9),
    ]
    ctx = context([(NOTES, "notes.md"), (OTHER, "bread.md")])

    excerpts = pertinent_excerpts(ctx, lambda query, ids: (passages, 3))

    assert [excerpt["cite"] for excerpt in excerpts] == [
        "notes.md, lines 1-2",
        "notes.md, lines 2-3",
    ]


def test_excerpts_reach_the_model_as_untrusted_data_with_cites():
    model = MagicMock()
    model.complete.return_value = response(roadmap_json())
    ctx = context([(NOTES, "notes.md")])

    result, progress = run(
        model, ctx, lambda query, ids: ([passage(NOTES, 0, 0.1, "Ports live here")], 1)
    )

    request = json.loads(model.complete.call_args.args[0][1].content)
    assert request["source_excerpts"] == [
        {"cite": "notes.md, lines 1-2", "text": "Ports live here"}
    ]
    assert progress[0] == "Seymour is reading your sources…"
    assert result["excerpts"][0]["sourceId"] == NOTES


def test_a_failing_search_drafts_without_excerpts():
    model = MagicMock()
    model.complete.return_value = response(roadmap_json())

    def broken(query, ids):
        raise RuntimeError("database down")

    result, _progress = run(model, context([(NOTES, "notes.md")]), broken)

    request = json.loads(model.complete.call_args.args[0][1].content)
    assert "source_excerpts" not in request
    assert result["reason"] == "generated"


def test_generation_job_searches_only_live_sources_and_publishes_the_roadmap(noop_trace):
    model = MagicMock()
    model.complete.return_value = response(roadmap_json())
    searched = []

    def search(query, ids):
        searched.append(ids)

        return [passage(NOTES, 0, 0.1)], 1

    runtime = ExecutionResources(model, noop_trace, lambda: 0.0, search)
    control = MagicMock()
    control.active.return_value = True
    control.live_sources.return_value = [NOTES]
    published = []
    snapshot = {
        "requestKey": str(uuid4()),
        "kind": "generation",
        **context([(NOTES, "notes.md"), (OTHER, "deleted.md")]).model_dump(),
    }

    run_generation_job(
        "execution",
        "lease",
        snapshot,
        GENERATION_BUDGET,
        control,
        published.append,
        lambda _: runtime,
    )

    assert searched == [[NOTES]]
    final = published[-1]
    assert final.status == "completed"
    assert final.roadmap["definition"]["title"] == "Hexagonal NestJS"
    assert "3 steps" in final.text


def test_failed_generation_completes_with_a_message_and_no_roadmap(noop_trace):
    model = MagicMock()
    model.complete.return_value = response("not json")
    runtime = ExecutionResources(model, noop_trace, lambda: 0.0)
    control = MagicMock()
    control.active.return_value = True
    published = []
    snapshot = {"requestKey": str(uuid4()), "kind": "generation", **context().model_dump()}

    run_generation_job(
        "execution",
        "lease",
        snapshot,
        GENERATION_BUDGET,
        control,
        published.append,
        lambda _: runtime,
    )

    assert published[-1].roadmap is None
    assert "Nothing was saved" in published[-1].text


def test_claims_route_generation_only_with_its_budget():
    snapshot = {"kind": "generation"}

    assert Claim("running", "lease", snapshot, GENERATION_BUDGET).workflow() == "generation"

    with pytest.raises(ValueError):
        Claim("running", "lease", snapshot, 8000).workflow()


def test_roadmap_travels_only_on_events_that_carry_it():
    roadmap = {"definition": {"title": "x"}, "evidence": []}
    event = encode_result(
        Result("execution", "lease", 100, "completed", "text", 10, roadmap=roadmap)
    )

    assert event["roadmap"] == roadmap
    assert "roadmap" not in encode_result(Result("execution", "lease", 1, "running", "", 0))
