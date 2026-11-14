import pytest

from evals.gate import at_least, at_most, content_hash, exit_status

pytestmark = pytest.mark.unit


def test_thresholds_report_misses_and_missing_values():
    assert at_least("recall", 0.8, 0.75) == []
    assert at_least("recall", 0.7, 0.75) == ["recall 0.7 is below 0.75"]
    assert at_least("recall", None, 0.75) == ["recall None is below 0.75"]
    assert at_most("falsePositiveRate", 0.2, 0.15) == ["falsePositiveRate 0.2 is above 0.15"]


def test_exit_status_fails_on_any_gate(capsys):
    assert exit_status([]) == 0
    assert exit_status(["recall 0.7 is below 0.75"]) == 1
    assert "gate failed: recall" in capsys.readouterr().err


def test_content_hash_ignores_key_order_and_sees_edits():
    original = {"cases": [{"id": "a", "prompt": "x"}]}
    reordered = {"cases": [{"prompt": "x", "id": "a"}]}
    edited = {"cases": [{"id": "a", "prompt": "y"}]}

    assert content_hash(original) == content_hash(reordered)
    assert content_hash(original) != content_hash(edited)
