"""Tutor answers under pressure to hand over the solution, graded offline for leakage.

Each case runs the real tutor graph with the learner's starter file and earlier turns, then
grades the answer with the deterministic checks in `evals/pedagogy.py` against a reference
solution the model never sees. Leak and Socratic rates are reported per mode; solution mode
with Core's permission is the control and is not gated.

The tutor calls are paid. PEDAGOGY_JUDGE=1 adds the paid, advisory rubric judge.
Usage, from apps/seymour with `.env` and `.env.langfuse` loaded:
    EVAL_RUNS=1 EVAL_SPEND_LEDGER=/tmp/spend.json EVAL_SPEND_CAP_USD=0.25 \\
        .venv/bin/python -m evals.run_pedagogy [case-id ...]
Environment: EVAL_RUNS (1), EVAL_PROVIDER (openai), EVAL_OUTPUT, PEDAGOGY_JUDGE.
"""

import json
import os
import sys
import time
from pathlib import Path
from uuid import uuid4

from evals.gate import at_least, at_most, exit_status
from evals.pedagogy import grade, rates
from evals.pedagogy_judge import judge_answer, pedagogy_judge_task
from evals.runtime import Runtime, parse_run_count, select_cases, write_report
from src.tutor.application.guidance import guidance_task
from src.tutor.application.tools import TOOL_ARGUMENTS
from src.tutor.application.tutor import run_tutor
from src.tutor.domain.context import TutorContext

EVALS = Path(__file__).parent
DATASET = EVALS / "datasets" / "pedagogy.json"


def load() -> tuple[dict, str, str]:
    dataset = json.loads(DATASET.read_text())
    step = dataset["step"]
    starter = (EVALS / step["starter"]).read_text()
    reference = (EVALS / step["reference"]).read_text()

    return dataset, starter, reference


def context_for(case: dict, step: dict, starter: str) -> TutorContext:
    return TutorContext.model_validate(
        {
            "sessionId": str(uuid4()),
            "stepId": step["stepId"],
            "objective": step["objective"],
            "stepTitle": step["stepTitle"],
            "activeFile": step["path"],
            "files": {step["path"]: starter},
            "challenge": {"instructions": step["instructions"], "criteria": step["criteria"]},
            "recentTurns": case["turns"],
        }
    )


def gated(result: dict) -> bool:
    return result.get("control") != "solution"


def gate_failures(results: list[dict], runs: int, thresholds: dict) -> list[str]:
    """Worst run of the non-control cases; a failed run counts as neither leaked nor Socratic."""
    failures = []

    for run in range(1, runs + 1):
        rows = [row for row in results if row["run"] == run and gated(row)]
        if not rows:
            continue

        leak_rate = round(sum(row["leaked"] for row in rows) / len(rows), 3)
        socratic_rate = round(sum(row["socratic"] for row in rows) / len(rows), 3)

        failures += at_most(f"run {run} leakRate", leak_rate, thresholds["maxLeakRate"])
        failures += at_least(
            f"run {run} socraticRate", socratic_rate, thresholds["minSocraticRate"]
        )

    return failures


def main():
    dataset, starter, reference = load()
    selected = set(sys.argv[1:])
    runs = parse_run_count(os.environ.get("EVAL_RUNS", "1"))
    use_judge = os.environ.get("PEDAGOGY_JUDGE") == "1"

    cases = select_cases(dataset["cases"], selected)
    step = dataset["step"]

    runtime = Runtime("pedagogy", TOOL_ARGUMENTS)
    trace = runtime.trace
    model = runtime.model(guidance_task())
    judge_model = runtime.model(pedagogy_judge_task())
    results = []

    for run in range(1, runs + 1):
        for case in cases:
            context = context_for(case, step, starter)
            execution_id = str(uuid4())

            with trace.execution(execution_id, context.sessionId, "seymour-pedagogy-eval"):
                outcome = run_tutor(
                    context,
                    case["prompt"],
                    case["mode"],
                    "low",
                    case.get("solutionAllowed", False),
                    8000,
                    model,
                    lambda: True,
                    lambda _text, _tokens: None,
                    trace.tool,
                    clock=time.monotonic,
                )

            answered = outcome["failure"] is None
            grades = grade(outcome["text"], reference, starter) if answered else None

            result = {
                "id": case["id"],
                "run": run,
                "mode": case["mode"],
                "control": case.get("control"),
                "failure": outcome["failure"],
                "tokens": outcome["tokens"],
                "leaked": bool(grades and grades["leaked"]),
                "socratic": bool(grades and grades["socratic"]),
                "grades": grades,
                "text": outcome["text"],
            }

            if use_judge and answered:
                verdict = judge_answer(
                    judge_model, case, step, starter, outcome["text"], time.monotonic() + 60
                )
                result["judge"] = verdict.rubric() if verdict else None

            results.append(result)
            print(
                f"run {run} {case['id']}: leaked={result['leaked']} "
                f"socratic={result['socratic']} failure={result['failure']}",
                flush=True,
            )

    trace.client.flush()

    failures = gate_failures(results, runs, dataset["thresholds"])
    report = {
        **runtime.identity({"step": step, "cases": cases, "reference": reference}, guidance_task()),
        "dataset_version": dataset["version"],
        "runs": runs,
        "byMode": rates([row for row in results if row["failure"] is None]),
        "failed": sum(row["failure"] is not None for row in results),
        "thresholds": dataset["thresholds"],
        "gateFailures": failures,
        "results": results,
    }

    output = os.environ.get("EVAL_OUTPUT")
    write_report(output, report)

    print(json.dumps({key: report[key] for key in ("byMode", "failed", "gateFailures")}))

    return exit_status(failures)


if __name__ == "__main__":
    raise SystemExit(main())
