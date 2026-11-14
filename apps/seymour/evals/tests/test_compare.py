import pytest

from evals.compare import decide

pytestmark = pytest.mark.unit

DATASET = {
    "thresholds": {"maxFalseAcceptRate": 0.0},
    "tolerance": {"falseAcceptRate": 0.0},
}
METRICS = {
    "falseAcceptRate": 0.0,
    "falseRejectRate": 0.1,
    "crossFileRejections": 1.0,
    "criterionAccuracy": 0.95,
}


def report(dataset_hash, version=2):
    summary = {key: {"mean": value, "min": value, "max": value} for key, value in METRICS.items()}

    return {
        "dataset_version": version,
        "dataset_hash": dataset_hash,
        "splits": {"tuning": {"runs": [METRICS], "summary": summary}},
    }


def test_reports_of_the_same_dataset_content_are_compared():
    decision = decide(report("sha256:a"), report("sha256:a"), DATASET)

    assert decision["promote"] is True


def test_edited_cases_block_promotion_even_with_the_same_version():
    decision = decide(report("sha256:a"), report("sha256:b"), DATASET)

    assert decision["promote"] is False
    assert decision["reasons"] == ["reports measured different dataset content"]


def test_a_report_without_a_dataset_hash_is_not_comparable():
    decision = decide(report(None), report(None), DATASET)

    assert decision["promote"] is False
