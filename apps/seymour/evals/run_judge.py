"""Measure the feedback judge's agreement with the reviewed labels, once per run.

Usage: python -m evals.run_judge   (paid; EVAL_RUNS (3), EVAL_OUTPUT, EVAL_SPEND_LEDGER)
Reads evals/fixtures/judge/calibration.json and labels-final.json (human-reviewed labels).
"""

import json
import os
import time
from pathlib import Path
from uuid import uuid4

from evals.gate import at_least, at_most, exit_status
from evals.judge import JUDGE_PROMPTS, RUBRIC, agreement, judge, judge_task
from evals.spend import MeteredTrace, SpendLedger
from src.shared.infrastructure.models import model_name, provider_model, settings_from_env
from src.shared.infrastructure.tracing import ExecutionTrace

FIXTURES = Path(__file__).parent / "fixtures" / "judge"
# Worst-run kappa per gated rubric item; "progression" agrees near chance and stays advisory.
MIN_KAPPA = {"specific": 0.6, "no_solution": 0.6}
MAX_INVALID = 0


def gate_failures(runs: list[dict], invalid: int) -> list[str]:
    failures = at_most("invalid verdicts", invalid, MAX_INVALID)

    for item, minimum in MIN_KAPPA.items():
        kappas = [run[item]["kappa"] for run in runs]
        worst = None if None in kappas else min(kappas)
        failures += at_least(f"{item} worst kappa", worst, minimum)

    return failures


def main():
    calibration = json.loads((FIXTURES / "calibration.json").read_text())
    labels = json.loads((FIXTURES / "labels-final.json").read_text())["labels"]
    steps = json.loads((Path(__file__).parent / "datasets" / "evaluation.json").read_text())[
        "steps"
    ]
    runs = int(os.environ.get("EVAL_RUNS", "3"))
    provider = os.environ.get("EVAL_PROVIDER", "openai")

    settings = settings_from_env()
    trace = MeteredTrace(ExecutionTrace(), SpendLedger.from_env("judge"))
    model = provider_model(provider, judge_task(), settings, trace)
    per_run = []

    for run in range(1, runs + 1):
        verdicts = []

        for item in calibration["items"]:
            with trace.execution(str(uuid4()), str(uuid4()), "seymour-judge-eval"):
                verdict, _tokens = judge(model, item, steps[item["step"]], time.monotonic() + 60)

            verdicts.append(verdict.rubric() if verdict else None)

        per_run.append(verdicts)
        print(f"run {run}: {json.dumps(agreement(labels, verdicts))}", flush=True)

    trace.client.flush()

    stable = {
        item: sum(
            len({run[index][item] for run in per_run if run[index] is not None}) <= 1
            for index in range(len(labels))
        )
        / len(labels)
        for item in RUBRIC
    }
    report = {
        "prompt": JUDGE_PROMPTS.id,
        "prompt_version": JUDGE_PROMPTS.version,
        "model": model_name(provider, settings),
        "items": len(labels),
        "runs": [agreement(labels, verdicts) for verdicts in per_run],
        "consistency": {item: round(value, 3) for item, value in stable.items()},
        "invalid": sum(verdict is None for verdicts in per_run for verdict in verdicts),
        "verdicts": per_run,
    }

    text = json.dumps(report, indent=2)
    output = os.environ.get("EVAL_OUTPUT")
    if output:
        Path(output).write_text(text + "\n")

    print(json.dumps({key: report[key] for key in ("runs", "consistency", "invalid")}))

    return exit_status(gate_failures(report["runs"], report["invalid"]))


if __name__ == "__main__":
    raise SystemExit(main())
