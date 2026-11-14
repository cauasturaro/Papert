import pytest

from evals import run_generation, run_judge, run_memory, run_recommendation

pytestmark = pytest.mark.unit


def test_memory_gate_checks_each_reported_suite():
    healthy = {
        "proposals": {"recall": 0.88, "falsePositiveRate": 0.07},
        "preference_use": {"hitRateWithMemory": 0.44, "hitRateControl": 0.17},
        "long_conversation": {"summaryPendingRetention": 1.0},
    }
    regressed = {
        "proposals": {"recall": 0.5, "falsePositiveRate": 0.3},
        "preference_use": {"hitRateWithMemory": 0.2, "hitRateControl": 0.2},
    }

    assert run_memory.gate_failures(healthy) == []
    assert len(run_memory.gate_failures(regressed)) == 3
    assert run_memory.gate_failures({}) == []


def test_judge_gate_uses_the_worst_run_and_ignores_the_advisory_item():
    good = {
        "specific": {"kappa": 1.0},
        "no_solution": {"kappa": 1.0},
        "progression": {"kappa": 0.0},
    }
    weak = {**good, "no_solution": {"kappa": 0.4}}
    undefined = {**good, "specific": {"kappa": None}}

    assert run_judge.gate_failures([good, good], 0) == []
    assert run_judge.gate_failures([good, weak], 0) == ["no_solution worst kappa 0.4 is below 0.6"]
    assert run_judge.gate_failures([undefined], 0) == ["specific worst kappa None is below 0.6"]
    assert run_judge.gate_failures([good], 1) == ["invalid verdicts 1 is above 0"]


def test_generation_gate_fails_on_errors_invalid_drafts_or_forbidden_content():
    valid = {"id": "a", "error": None, "checks": {"valid": True, "forbidden": True}}
    invalid = {"id": "b", "error": None, "checks": {"valid": False}}
    crashed = {"id": "c", "error": "RuntimeError: usage", "checks": {"valid": False}}

    assert run_generation.gate_failures([valid]) == []
    assert run_generation.gate_failures([valid, invalid]) == ["valid rate 0.5 is below 1.0"]
    assert "generation raised in ['c']" in run_generation.gate_failures([valid, crashed])


def test_recommendation_gate_checks_every_run():
    good = {"run": 1, "current": {"hitRate": 1.0, "falsePositiveRate": 0.18}}
    noisy = {"run": 2, "current": {"hitRate": 1.0, "falsePositiveRate": 0.4}}

    assert run_recommendation.gate_failures([good]) == []
    assert run_recommendation.gate_failures([good, noisy]) == [
        "run 2 falsePositiveRate 0.4 is above 0.25"
    ]
