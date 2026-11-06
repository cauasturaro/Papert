import pytest

from evals.quality import aggregate, consistency, promotion, run_metrics, threshold_failures

pytestmark = pytest.mark.unit

THRESHOLDS = {
    "maxFalseAcceptRate": 0.0,
    "maxFalseRejectRate": 0.25,
    "minCrossFileRejections": 1.0,
    "minCriterionAccuracy": 0.9,
}


def result(case, verdict, expected, split="tuning", label="correct", mismatches=()):
    return {
        "id": case,
        "split": split,
        "label": label,
        "expected": expected,
        "verdict": verdict,
        "correct": verdict == expected,
        "labeledCriteria": 2,
        "labeledIds": ["a", "b"],
        "criterionMismatches": list(mismatches),
    }


def good_run(split="tuning"):
    return [
        result("ok", "approve", "approve", split),
        result("bad", "reject", "reject", split, mismatches=()),
        result("layers", "reject", "reject", split, label="cross_file_violation"),
    ]


def test_invalid_output_counts_as_a_rejection_never_an_approval():
    metrics = run_metrics([result("ok", "invalid", "approve"), result("bad", "invalid", "reject")])

    assert metrics["falseRejectRate"] == 1.0
    assert metrics["falseAcceptRate"] == 0.0
    assert metrics["invalid"] == 2


def test_aggregate_reports_each_split_with_spread_and_consistency():
    runs = [
        good_run() + good_run("holdout"),
        good_run() + [result("ok", "reject", "approve", "holdout")] + good_run("holdout")[1:],
    ]

    report = aggregate(runs)

    assert set(report) == {"tuning", "holdout"}
    assert report["tuning"]["verdictConsistency"] == 1.0
    assert report["holdout"]["verdictConsistency"] == pytest.approx(0.667)
    assert report["holdout"]["summary"]["falseRejectRate"] == {"mean": 0.5, "min": 0.0, "max": 1.0}
    assert report["tuning"]["criteria"]["a"] == {"labeled": 6, "accuracy": 1.0}


def test_thresholds_apply_to_the_worst_run_not_the_mean():
    # Two clean runs and one false accept: the mean (0.17) would hide the failing run.
    runs = [good_run(), good_run(), [result("bad", "approve", "reject"), *good_run()[::2]]]

    failures = threshold_failures(aggregate(runs), THRESHOLDS)

    assert failures == ["tuning: worst falseAcceptRate 0.5 vs maxFalseAcceptRate 0.0"]


def test_a_regressed_candidate_is_blocked_even_within_absolute_thresholds():
    baseline = {"splits": aggregate([good_run() + good_run("holdout")] * 3)}
    worse = good_run() + [
        result("ok", "approve", "approve", "holdout"),
        result("bad", "reject", "reject", "holdout", mismatches=["a"]),
        result("layers", "reject", "reject", "holdout", label="cross_file_violation"),
    ]
    candidate = {"splits": aggregate([worse] * 3)}

    decision = promotion(baseline, candidate, {**THRESHOLDS, "minCriterionAccuracy": 0.8}, {})

    assert decision["promote"] is False
    assert decision["reasons"] == ["holdout: mean criterionAccuracy 1.0 -> 0.833 (tolerance 0.0)"]


def test_an_equal_candidate_is_promoted_and_tolerance_absorbs_noise():
    baseline = {"splits": aggregate([good_run() + good_run("holdout")] * 3)}
    noisy = {"splits": aggregate([good_run() + good_run("holdout")] * 3)}
    noisy["splits"]["holdout"]["summary"]["criterionAccuracy"]["mean"] = 0.98

    decision = promotion(baseline, noisy, THRESHOLDS, {"criterionAccuracy": 0.03})

    assert decision == {"promote": True, "reasons": []}


def test_a_candidate_missing_a_split_is_blocked():
    baseline = {"splits": aggregate([good_run()])}
    candidate = {"splits": aggregate([good_run("holdout")])}

    decision = promotion(baseline, candidate, THRESHOLDS, {})

    assert decision["reasons"] == ["holdout: baseline has no runs for this split"]


def test_consistency_of_empty_runs_is_complete():
    assert consistency([[], []]) == 1.0
