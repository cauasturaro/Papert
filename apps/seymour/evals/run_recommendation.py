"""Measure community recommendations on the labeled goals, several runs per case.

Candidates are the catalog exactly as Core snapshots it (`fixtures/catalog.json`), embedded
with the production model through Seymour's own embedder and ranking rules. Reports the hit
rate (an expected roadmap among the matches), unrelated-goal false positives and a sweep of
thresholds over the measured similarities. The command makes paid embedding requests.

Usage, from apps/seymour with `.env` loaded:
    RECOMMENDATION_RUNS=3 .venv/bin/python -m evals.run_recommendation [case-id ...]
"""

import json
import os
import sys
from pathlib import Path

from evals.gate import at_least, at_most, exit_status
from evals.runtime import Runtime, parse_run_count, select_cases, write_report
from src.recommendation.domain.recommendation import (
    SIMILARITY_THRESHOLD,
    Candidate,
    candidate_text,
    goal_text,
    rank,
)

EVALS = Path(__file__).parent
DATASET = json.loads((EVALS / "datasets" / "recommendation.json").read_text(encoding="utf-8"))
CATALOG = json.loads((EVALS / "fixtures" / "catalog.json").read_text(encoding="utf-8"))

SWEEP = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55]


def score(cases, candidates, goal_vectors, candidate_vectors, threshold):
    """Hit rate on cases that expect a roadmap; false-positive rate on those that expect none."""
    hits = 0
    expecting = 0
    false_positives = 0
    unrelated = 0
    details = []

    for case in cases:
        compared = [(candidate, candidate_vectors[candidate.roadmapId]) for candidate in candidates]
        matches = rank(goal_vectors[case["id"]], compared, case["level"], threshold)
        matched = [match["roadmapId"] for match in matches]
        expected = set(case["expected"])

        if expected:
            expecting += 1
            hit = bool(expected & set(matched))
            hits += hit
        else:
            unrelated += 1
            hit = not matched
            false_positives += not hit

        details.append({"id": case["id"], "matched": matched, "hit": hit})

    return {
        "threshold": threshold,
        "hitRate": hits / expecting if expecting else None,
        "falsePositiveRate": false_positives / unrelated if unrelated else None,
        "hits": hits,
        "expecting": expecting,
        "falsePositives": false_positives,
        "unrelated": unrelated,
        "details": details,
    }


# Regression floors around the last measured run at the production threshold.
MIN_HIT_RATE = 0.9
MAX_FALSE_POSITIVE_RATE = 0.25


def gate_failures(runs: list[dict]) -> list[str]:
    failures = []

    for run in runs:
        current = run["current"]
        failures += at_least(f"run {run['run']} hitRate", current["hitRate"], MIN_HIT_RATE)
        failures += at_most(
            f"run {run['run']} falsePositiveRate",
            current["falsePositiveRate"],
            MAX_FALSE_POSITIVE_RATE,
        )

    return failures


def main():
    selected = set(sys.argv[1:])
    cases = select_cases(DATASET["cases"], selected)
    candidates = [Candidate.model_validate(item) for item in CATALOG["candidates"]]
    runs = parse_run_count(os.environ.get("RECOMMENDATION_RUNS", "1"))
    runtime = Runtime("recommendation")
    embedder = runtime.embeddings()
    report = {
        **runtime.identity(DATASET),
        "embedding_model": embedder.model,
        "threshold": SIMILARITY_THRESHOLD,
        "runs": [],
    }

    for run in range(1, runs + 1):
        texts = [candidate_text(candidate) for candidate in candidates]
        vectors, catalog_tokens = embedder.embed_many(texts)
        candidate_vectors = {
            candidate.roadmapId: vector
            for candidate, vector in zip(candidates, vectors, strict=True)
        }

        goal_vectors = {}
        goal_tokens = 0
        for case in cases:
            [vector], tokens = embedder.embed_many([goal_text(case["goal"])])
            goal_vectors[case["id"]] = vector
            goal_tokens += tokens

        current = score(cases, candidates, goal_vectors, candidate_vectors, SIMILARITY_THRESHOLD)

        sweep = [
            {
                key: value
                for key, value in score(
                    cases, candidates, goal_vectors, candidate_vectors, threshold
                ).items()
                if key != "details"
            }
            for threshold in SWEEP
        ]

        print(
            f"run {run}: hit {current['hits']}/{current['expecting']}, "
            f"false positives {current['falsePositives']}/{current['unrelated']}, "
            f"tokens {catalog_tokens + goal_tokens}",
            flush=True,
        )

        report["runs"].append(
            {
                "run": run,
                "tokens": {"catalog": catalog_tokens, "goals": goal_tokens},
                "current": current,
                "sweep": sweep,
            }
        )

    output = os.environ.get("RECOMMENDATION_OUTPUT")
    write_report(output, report)

    return exit_status(gate_failures(report["runs"]))


if __name__ == "__main__":
    raise SystemExit(main())
