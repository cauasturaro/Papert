"""Promotion gate: may the candidate report replace the baseline report?

Usage: python -m evals.compare <baseline.json> <candidate.json> [decision.json]
Exits 1 when the candidate is blocked. Tolerances are fixed in the dataset file before the
final round, so a threshold cannot be moved to hide a regression afterwards.
"""

import json
import sys
from pathlib import Path

from evals.quality import promotion


def decide(baseline: dict, candidate: dict, dataset: dict) -> dict:
    # Same version is not enough: a case edited without a version bump changes the hash.
    baseline_hash = baseline.get("dataset_hash")
    comparable = baseline_hash is not None and baseline_hash == candidate.get("dataset_hash")

    if not comparable:
        decision = {"promote": False, "reasons": ["reports measured different dataset content"]}
    else:
        decision = promotion(baseline, candidate, dataset["thresholds"], dataset["tolerance"])

    if candidate.get("stoppedEarly"):
        decision["reasons"].append("candidate stopped after a run failed its thresholds")
        decision["promote"] = False

    return {
        "baseline": _identity(baseline),
        "candidate": _identity(candidate),
        **decision,
    }


def main():
    baseline = json.loads(Path(sys.argv[1]).read_text())
    candidate = json.loads(Path(sys.argv[2]).read_text())
    dataset = json.loads((Path(__file__).parent / "datasets" / "evaluation.json").read_text())

    result = decide(baseline, candidate, dataset)
    text = json.dumps(result, indent=2)

    if len(sys.argv) > 3:
        Path(sys.argv[3]).write_text(text + "\n")

    print(text)

    return 0 if result["promote"] else 1


def _identity(report: dict) -> dict:
    keys = (
        "dataset_version",
        "dataset_hash",
        "prompt",
        "prompt_version",
        "provider",
        "model",
        "effort",
        "runsCompleted",
    )

    return {key: report.get(key) for key in keys}


if __name__ == "__main__":
    raise SystemExit(main())
