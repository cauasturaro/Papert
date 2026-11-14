import json
from uuid import uuid4

import pytest

from src.roadmap.domain.roadmap import (
    GenerationContext,
    ModelRoadmap,
    RoadmapRuleError,
    bind,
)

pytestmark = pytest.mark.unit

NOTES = str(uuid4())


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


EXCERPT = {
    "sourceId": NOTES,
    "cite": "notes.md, lines 1-6",
    "location": {"lineStart": 1, "lineEnd": 6},
    "start": 0,
    "text": "Ports live in src/core/ports.",
}


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
