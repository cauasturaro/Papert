import json
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.executions.application.resources import ExecutionResources
from src.executions.application.workflows import run_generation_job
from src.roadmap.application.generator import (
    GENERATION_BUDGET,
)
from src.roadmap.domain.roadmap import (
    GenerationContext,
)
from src.shared.domain.inference import Message

pytestmark = pytest.mark.unit

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


def passage(document_id, ordinal, distance, content="text"):
    return {
        "documentId": document_id,
        "ordinal": ordinal,
        "start": 0,
        "content": content,
        "location": {"lineStart": ordinal + 1, "lineEnd": ordinal + 2},
        "distance": distance,
    }


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
