"""Roadmap generation contracts and pure rules. Seymour drafts; only Core consolidates."""

from typing import Annotated, Literal

from pydantic import Field

from src.shared.domain.workspace import StrictModel, validate_workspace

Slug = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9-]{0,59}$")]
Level = Literal["beginner", "intermediate", "advanced"]

MIN_STEPS = 3
MAX_STEPS = 8
MAX_EVIDENCE = 20


class GenerationSource(StrictModel):
    """A ready source Core authorized for the preparation workspace."""

    id: Annotated[str, Field(min_length=36, max_length=36)]
    filename: Annotated[str, Field(min_length=1, max_length=200)]
    format: Literal["pdf", "doc", "docx", "md"]


class GenerationContext(StrictModel):
    """Core-authorized snapshot of a roadmap draft; the goal is untrusted learner text."""

    sessionId: Annotated[str, Field(min_length=1, max_length=100)]
    workspaceId: Annotated[str, Field(min_length=36, max_length=36)]
    goal: Annotated[str, Field(min_length=10, max_length=500)]
    level: Level
    sources: Annotated[list[GenerationSource], Field(max_length=20)]


class ModelCriterion(StrictModel):
    id: Slug
    description: Annotated[str, Field(min_length=1, max_length=400)]


class ModelChallenge(StrictModel):
    instructions: Annotated[str, Field(min_length=1, max_length=1500)]
    criteria: Annotated[list[ModelCriterion], Field(min_length=2, max_length=5)]


class ModelStep(StrictModel):
    id: Slug
    title: Annotated[str, Field(min_length=1, max_length=120)]
    concepts: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=80)]], Field(min_length=1, max_length=6)
    ]
    content: Annotated[str, Field(min_length=1, max_length=3000)]
    requires: Annotated[list[Slug], Field(max_length=5)]
    challenge: ModelChallenge
    # Cites of the given excerpts this step relies on; anything else is dropped.
    sources: Annotated[list[Annotated[str, Field(max_length=300)]], Field(max_length=3)]


class StarterFile(StrictModel):
    path: Annotated[str, Field(min_length=1, max_length=200)]
    content: Annotated[str, Field(max_length=4000)]


class ModelRoadmap(StrictModel):
    """What the model may produce. Strict provider schemas have no maps, so files are a list."""

    title: Annotated[str, Field(min_length=1, max_length=120)]
    description: Annotated[str, Field(min_length=1, max_length=600)]
    steps: Annotated[list[ModelStep], Field(min_length=MIN_STEPS, max_length=MAX_STEPS)]
    starterFiles: Annotated[list[StarterFile], Field(min_length=1, max_length=8)]


class RoadmapRuleError(ValueError):
    """The draft is well-formed JSON but breaks a roadmap rule; the message is model-safe."""


def check_rules(result: ModelRoadmap) -> None:
    """Unique ids, prerequisites on earlier steps only, and a valid starter workspace."""
    seen: set[str] = set()

    for step in result.steps:
        if step.id in seen:
            raise RoadmapRuleError(f"Step id '{step.id}' is used twice.")

        unknown = [required for required in step.requires if required not in seen]
        if unknown:
            raise RoadmapRuleError(
                f"Step '{step.id}' requires '{unknown[0]}', which is not an earlier step."
            )

        criteria = [criterion.id for criterion in step.challenge.criteria]
        if len(set(criteria)) != len(criteria):
            raise RoadmapRuleError(f"Step '{step.id}' repeats a criterion id.")

        seen.add(step.id)

    paths = [file.path for file in result.starterFiles]
    if len(set(paths)) != len(paths):
        raise RoadmapRuleError("Starter file paths must be unique.")

    try:
        validate_workspace({file.path: file.content for file in result.starterFiles})
    except ValueError as error:
        raise RoadmapRuleError(
            "Starter files need relative paths of letters, digits, '.', '_', '-' and '/'."
        ) from error


def bind(result: ModelRoadmap, context: GenerationContext, excerpts: list[dict]) -> dict:
    """Core's definition plus private evidence: only cites of excerpts given in this run count."""
    check_rules(result)

    by_cite = {excerpt["cite"]: excerpt for excerpt in excerpts}
    steps = []
    evidence = []

    for step in result.steps:
        steps.append(
            {
                "id": step.id,
                "title": step.title,
                "content": step.content,
                "concepts": list(step.concepts),
                "requires": list(step.requires),
                "challenge": step.challenge.model_dump(),
            }
        )

        for cited in dict.fromkeys(step.sources):
            excerpt = by_cite.get(cited)

            if excerpt is None or len(evidence) >= MAX_EVIDENCE:
                continue

            evidence.append(
                {
                    "stepId": step.id,
                    "sourceId": excerpt["sourceId"],
                    "cite": excerpt["cite"],
                    "location": excerpt["location"],
                }
            )

    definition = {
        "title": result.title,
        "description": result.description,
        "level": context.level,
        "steps": steps,
        "starterFiles": {file.path: file.content for file in result.starterFiles},
    }

    return {"definition": definition, "evidence": evidence}
