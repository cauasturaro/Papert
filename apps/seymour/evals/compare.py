"""Promotion gate: may the candidate report replace the baseline report?

Usage: python -m evals.compare <baseline.json> <candidate.json> [decision.json]
Exits 1 when the candidate is blocked. Tolerances are fixed in the dataset file before the
final round, so a threshold cannot be moved to hide a regression afterwards.
"""

import json
import sys
from pathlib import Path

from evals.quality import promotion


def main():
    baseline = json.loads(Path(sys.argv[1]).read_text())
    candidate = json.loads(Path(sys.argv[2]).read_text())
    dataset = json.loads(Path(__file__).with_name("evaluation.json").read_text())

    comparable = baseline["dataset_version"] == candidate["dataset_version"]
    decision = promotion(baseline, candidate, dataset["thresholds"], dataset["tolerance"])

    if not comparable:
        decision = {"promote": False, "reasons": ["reports use different dataset versions"]}

    if candidate.get("stoppedEarly"):
        decision["reasons"].append("candidate stopped after a run failed its thresholds")
        decision["promote"] = False

    result = {
        "baseline": _identity(baseline),
        "candidate": _identity(candidate),
        **decision,
    }
    text = json.dumps(result, indent=2)

    if len(sys.argv) > 3:
        Path(sys.argv[3]).write_text(text + "\n")

    print(text)

    return 0 if decision["promote"] else 1


def _identity(report: dict) -> dict:
    keys = ("prompt", "prompt_version", "provider", "model", "effort", "runsCompleted")

    return {key: report.get(key) for key in keys}


if __name__ == "__main__":
    raise SystemExit(main())
