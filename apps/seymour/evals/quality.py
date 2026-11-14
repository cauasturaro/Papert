"""Aggregate repeated eval runs and decide whether a candidate may replace the baseline.

Thresholds apply to the worst run, never to the mean alone, and the tuning and held-out
splits are judged separately so prompt tuning cannot hide a held-out regression.
"""

from statistics import mean

SPLITS = ("tuning", "holdout")


def run_metrics(results: list[dict]) -> dict:
    """Metrics of one run over the given evaluation results (one per case)."""
    should_approve = [result for result in results if result["expected"] == "approve"]
    should_reject = [result for result in results if result["expected"] == "reject"]
    cross_file = [result for result in results if result["label"] == "cross_file_violation"]

    labeled = sum(result["labeledCriteria"] for result in results)
    mismatches = sum(len(result["criterionMismatches"]) for result in results)
    false_accepts = sum(result["verdict"] == "approve" for result in should_reject)
    # An invalid evaluation never approves, so it counts as a rejection.
    false_rejects = sum(result["verdict"] != "approve" for result in should_approve)
    cross_file_rejections = sum(result["verdict"] != "approve" for result in cross_file)

    return {
        "cases": len(results),
        "accuracy": _ratio(sum(result["correct"] for result in results), len(results)),
        "falseAcceptRate": _ratio(false_accepts, len(should_reject), empty=0.0),
        "falseRejectRate": _ratio(false_rejects, len(should_approve), empty=0.0),
        "crossFileRejections": _ratio(cross_file_rejections, len(cross_file)),
        "criterionAccuracy": _ratio(labeled - mismatches, labeled),
        "invalid": sum(result["verdict"] == "invalid" for result in results),
    }


def criterion_accuracy(results: list[dict]) -> dict:
    """Per criterion id: labeled count and share of runs × cases the model got right."""
    totals: dict[str, list[int]] = {}

    for result in results:
        for criterion in result["labeledIds"]:
            hits = totals.setdefault(criterion, [0, 0])
            hits[1] += 1
            hits[0] += criterion not in result["criterionMismatches"]

    return {
        key: {"labeled": total, "accuracy": _ratio(hit, total)}
        for key, (hit, total) in sorted(totals.items())
    }


def aggregate(runs: list[list[dict]]) -> dict:
    """Per split: every run's metrics, mean/min/max and how consistent each verdict was."""
    report = {}

    for split in SPLITS:
        per_run = [[result for result in run if result["split"] == split] for run in runs]
        metrics = [run_metrics(results) for results in per_run if results]

        if not metrics:
            continue

        report[split] = {
            "runs": metrics,
            "summary": {key: _spread([entry[key] for entry in metrics]) for key in metrics[0]},
            "verdictConsistency": consistency(per_run),
            "criteria": criterion_accuracy([result for run in per_run for result in run]),
        }

    return report


def consistency(per_run: list[list[dict]]) -> float:
    """Share of cases whose verdict was identical in every run."""
    verdicts: dict[str, set[str]] = {}

    for run in per_run:
        for result in run:
            verdicts.setdefault(result["id"], set()).add(result["verdict"])

    stable = sum(len(values) == 1 for values in verdicts.values())

    return _ratio(stable, len(verdicts))


# Direction of each thresholded metric: "max" is an upper bound, "min" a lower bound.
THRESHOLD_METRICS = {
    "maxFalseAcceptRate": ("falseAcceptRate", "max"),
    "maxFalseRejectRate": ("falseRejectRate", "max"),
    "minCrossFileRejections": ("crossFileRejections", "min"),
    "minCriterionAccuracy": ("criterionAccuracy", "min"),
}


def threshold_failures(report: dict, thresholds: dict) -> list[str]:
    """Every threshold the worst run of a split misses."""
    failures = []

    for split, data in report.items():
        for name, (metric, direction) in THRESHOLD_METRICS.items():
            if name not in thresholds:
                continue

            values = [run[metric] for run in data["runs"]]
            worst = max(values) if direction == "max" else min(values)
            limit = thresholds[name]
            missed = worst > limit if direction == "max" else worst < limit

            if missed:
                failures.append(f"{split}: worst {metric} {worst} vs {name} {limit}")

    return failures


def promotion(baseline: dict, candidate: dict, thresholds: dict, tolerance: dict) -> dict:
    """Blocks a candidate that misses a threshold or regresses beyond tolerance on any split."""
    reasons = threshold_failures(candidate["splits"], thresholds)

    for split, data in candidate["splits"].items():
        reference = baseline["splits"].get(split)
        if reference is None:
            reasons.append(f"{split}: baseline has no runs for this split")
            continue

        for metric, direction in THRESHOLD_METRICS.values():
            allowed = tolerance.get(metric, 0.0)
            before = reference["summary"][metric]["mean"]
            after = data["summary"][metric]["mean"]
            worse = after - before if direction == "max" else before - after

            if worse > allowed:
                reasons.append(f"{split}: mean {metric} {before} -> {after} (tolerance {allowed})")

    return {"promote": not reasons, "reasons": reasons}


def _spread(values: list[float]) -> dict:
    return {
        "mean": round(mean(values), 3),
        "min": min(values),
        "max": max(values),
    }


def _ratio(part: int, whole: int, empty: float = 1.0) -> float:
    return round(part / whole, 3) if whole else empty
