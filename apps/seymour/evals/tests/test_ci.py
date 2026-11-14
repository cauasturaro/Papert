import json
from pathlib import Path

import pytest

from evals import ci

pytestmark = pytest.mark.unit


def test_paid_runs_are_single_and_capped_by_default(monkeypatch, tmp_path):
    monkeypatch.delenv("EVAL_SPEND_CAP_USD", raising=False)
    monkeypatch.delenv("EVAL_SPEND_LEDGER", raising=False)
    monkeypatch.setenv("EVAL_RUNS", "5")

    environment = ci.paid_environment(tmp_path / "spend.json")

    assert environment["EVAL_RUNS"] == "1"
    assert environment["EVAL_SPEND_CAP_USD"] == ci.DEFAULT_CAP_USD
    assert environment["EVAL_SPEND_LEDGER"] == str(tmp_path / "spend.json")


def test_paid_subsets_name_existing_cases():
    evals = Path(ci.__file__).parent
    tutor = {case["id"] for case in json.loads((evals / "datasets" / "tutor.json").read_text())}
    pedagogy = {
        case["id"]
        for case in json.loads((evals / "datasets" / "pedagogy.json").read_text())["cases"]
    }
    suites = {"evals.run_tutor": tutor, "evals.run_pedagogy": pedagogy}

    for command in ci.PAID:
        module, cases = command[2], command[3:]

        assert set(cases) <= suites[module]


def test_offline_mode_never_starts_a_paid_suite(monkeypatch):
    commands = []
    monkeypatch.setattr(
        ci, "run", lambda command, environment=None: commands.append(command) or True
    )

    status = ci.main(["--offline"])

    assert status == 0
    assert commands == [ci.OFFLINE]
