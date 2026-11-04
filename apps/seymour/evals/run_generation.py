"""Measure roadmap generation on the labeled goals, several runs per case.

Fixture sources go through ingestion's real Markdown extractor and chunker, are embedded
with the production model and searched through Seymour's SourceSearch over an in-memory
index, so excerpts and citations match production. Checks are deterministic; the summary
reports the hit rate of each one. The command makes paid model requests.

Usage, from apps/seymour with `.env` loaded:
    GENERATION_RUNS=3 .venv/bin/python -m evals.run_generation [case-id ...]
"""

import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

from openai import OpenAI

from src.executions.infrastructure.composition import (
    GENERATION_OUTPUT_LIMITS,
    GENERATION_SEARCH_LIMIT,
)
from src.retrieval.application.search import SourceSearch
from src.retrieval.infrastructure.openai_embedder import DIMENSIONS, OpenAIQueryEmbedder
from src.roadmap.application.generator import GENERATION_BUDGET, run_generation
from src.roadmap.domain.roadmap import GenerationContext, ModelRoadmap
from src.tutor.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
from src.tutor.infrastructure.tracing import TutorTrace

EVALS = Path(__file__).parent
FIXTURES = EVALS / "fixtures" / "generation"
INGESTION = EVALS.parents[1] / "ingestion"

CHUNKER = """
import json, sys
from src.domain.chunking import chunk
from src.domain.extraction.markdown import extract_markdown

chunks = {}
for path in sys.argv[1:]:
    with open(path, "rb") as file:
        pieces = chunk(extract_markdown(file.read()))
    chunks[path] = [
        {"ordinal": p.ordinal, "content": p.content, "location": p.location, "start": p.char_start}
        for p in pieces
    ]
print(json.dumps(chunks))
"""


def ingestion_chunks(filenames: list[str]) -> dict[str, list[dict]]:
    """Runs ingestion's own chunker in its environment; both apps use a `src` package."""
    paths = [str(FIXTURES / name) for name in filenames]
    completed = subprocess.run(
        [str(INGESTION / ".venv" / "bin" / "python"), "-c", CHUNKER, *paths],
        cwd=INGESTION,
        env={"PYTHONPATH": str(INGESTION)},
        capture_output=True,
        text=True,
        check=True,
    )
    by_path = json.loads(completed.stdout)

    return {Path(path).name: chunks for path, chunks in by_path.items()}


def cosine_distance(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    norms = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))

    return 1 - dot / norms


class MemoryIndex:
    """PassageIndex over pre-embedded chunks, ordered like pgvector's cosine operator."""

    def __init__(self, passages: list[dict]):
        self.passages = passages

    def nearest(self, workspace_id, document_ids, vector, limit):
        scored = [
            {**passage["passage"], "distance": cosine_distance(vector, passage["vector"])}
            for passage in self.passages
            if passage["passage"]["documentId"] in document_ids
        ]
        scored.sort(key=lambda passage: passage["distance"])

        return scored[:limit]

    def following(self, workspace_id, passage):
        for candidate in self.passages:
            item = candidate["passage"]

            if (
                item["documentId"] == passage["documentId"]
                and item["ordinal"] == passage["ordinal"] + 1
            ):
                return {**item, "distance": None}

        return None


def index_sources(client: OpenAI, case: dict, chunks: dict[str, list[dict]]):
    sources = [{"id": str(uuid4()), "filename": name, "format": "md"} for name in case["sources"]]
    passages = []

    for source in sources:
        pieces = chunks[source["filename"]]
        response = client.embeddings.create(
            model=os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small"),
            input=[piece["content"] for piece in pieces],
            dimensions=DIMENSIONS,
            encoding_format="float",
        )

        for piece, embedding in zip(pieces, response.data, strict=True):
            passage = {"documentId": source["id"], **piece}
            passages.append({"passage": passage, "vector": embedding.embedding})

    return sources, MemoryIndex(passages)


def roadmap_text(definition: dict) -> str:
    parts = [definition["title"], definition["description"]]

    for step in definition["steps"]:
        parts += [step["title"], step["content"], *step["concepts"]]
        parts.append(step["challenge"]["instructions"])
        parts += [criterion["description"] for criterion in step["challenge"]["criteria"]]

    parts += [*definition["starterFiles"], *definition["starterFiles"].values()]

    return "\n".join(parts).lower()


def checks(case: dict, outcome: dict, sources: list[dict]) -> dict:
    """Deterministic checks; None marks a check that does not apply to the case."""
    expect = case["expect"]
    roadmap = outcome["roadmap"]

    if roadmap is None:
        return {"valid": False}

    definition = roadmap["definition"]
    evidence = roadmap["evidence"]
    text = roadmap_text(definition)
    names = {source["id"]: source["filename"] for source in sources}
    cited = {names[item["sourceId"]] for item in evidence}

    stack_hits = sum(term.lower() in text for term in case["stackTerms"])
    anchors = expect["anchors"]
    anchor_hits = sum(anchor.lower() in text for anchor in anchors)

    source_use = None
    if expect["sourceUse"] == "cited":
        source_use = set(expect["citedSources"]) <= cited
    elif expect["sourceUse"] == "none":
        source_use = not evidence

    return {
        "valid": True,
        "stack": stack_hits >= min(2, len(case["stackTerms"])),
        "forbidden": not any(term.lower() in text for term in expect["forbiddenTerms"]),
        "anchors": anchor_hits >= min(2, len(anchors)) if anchors else None,
        "sourceUse": source_use,
    }


def shape(roadmap: dict | None) -> dict | None:
    if roadmap is None:
        return None

    steps = roadmap["definition"]["steps"]

    return {
        "title": roadmap["definition"]["title"],
        "steps": len(steps),
        "criteria": sum(len(step["challenge"]["criteria"]) for step in steps),
        "words": sum(len(step["content"].split()) for step in steps),
        "files": len(roadmap["definition"]["starterFiles"]),
        "evidence": len(roadmap["evidence"]),
    }


def main():
    dataset = json.loads((EVALS / "generation.json").read_text())
    selected = set(sys.argv[1:])
    runs = int(os.environ.get("GENERATION_RUNS", "3"))
    effort = os.environ.get("GENERATION_EFFORT", "low")
    output = os.environ.get("GENERATION_OUTPUT")

    cases = [case for case in dataset["cases"] if not selected or case["id"] in selected]
    filenames = sorted({name for case in cases for name in case["sources"]})
    chunks = ingestion_chunks(filenames) if filenames else {}

    client = OpenAI(max_retries=0, timeout=30)
    trace = TutorTrace()
    model = OpenAIModel(
        os.environ["OPENAI_API_KEY"],
        os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        trace.generation,
        "roadmap_draft",
        ModelRoadmap.model_json_schema(),
        GENERATION_OUTPUT_LIMITS,
    )
    results = []

    for case in cases:
        for run in range(1, runs + 1):
            sources, index = index_sources(client, case, chunks)
            workspace_id = str(uuid4())
            searcher = SourceSearch(
                workspace_id,
                [source["id"] for source in sources],
                OpenAIQueryEmbedder(),
                index,
            )

            def search(query, document_ids, searcher=searcher):
                return searcher.search(query, document_ids, GENERATION_SEARCH_LIMIT)

            context = GenerationContext(
                sessionId=str(uuid4()),
                workspaceId=workspace_id,
                goal=case["goal"],
                level=case["level"],
                sources=sources,
            )
            started = time.monotonic()

            # Job failures are an outcome to measure; the tracer would mask their cause.
            failure = None

            with trace.execution(str(uuid4()), context.sessionId, "seymour-roadmap-eval"):
                try:
                    outcome = run_generation(
                        context,
                        effort,
                        GENERATION_BUDGET,
                        model,
                        lambda: True,
                        lambda _text, _tokens: None,
                        search if sources else None,
                        clock=time.monotonic,
                    )
                except Exception as error:
                    failure = f"{type(error).__name__}: {error}"[:300]
                    outcome = {"reason": "error", "calls": 0, "tokens": 0, "excerpts": []}
                    outcome["roadmap"] = None

            result = {
                "id": case["id"],
                "category": case["category"],
                "level": case["level"],
                "run": run,
                "reason": outcome["reason"],
                "calls": outcome["calls"],
                "tokens": outcome["tokens"],
                "seconds": round(time.monotonic() - started, 1),
                "excerpts": len(outcome["excerpts"]),
                "checks": checks(case, outcome, sources),
                "shape": shape(outcome["roadmap"]),
                "error": failure,
            }
            results.append(result)

            if output:
                result["roadmap"] = outcome["roadmap"]

            print(json.dumps({key: value for key, value in result.items() if key != "roadmap"}))

    names = ["valid", "stack", "forbidden", "anchors", "sourceUse"]
    summary = {}

    for name in names:
        applicable = [
            result["checks"][name] for result in results if result["checks"].get(name) is not None
        ]
        summary[name] = f"{sum(applicable)}/{len(applicable)}"

    generated = [result for result in results if result["reason"] == "generated"]
    summary["errors"] = [result["error"] for result in results if result["error"]]
    summary["repaired"] = sum(result["calls"] > 1 for result in generated)
    summary["maxTokens"] = max(result["tokens"] for result in results)
    summary["maxSeconds"] = max(result["seconds"] for result in results)
    summary["meanSeconds"] = round(sum(r["seconds"] for r in results) / len(results), 1)

    print(json.dumps({"summary": summary}))

    if output:
        Path(output).write_text(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
