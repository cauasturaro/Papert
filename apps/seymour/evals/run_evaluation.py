"""Measure false accepts and false rejects of the evaluation graph on the labeled dataset.

Approval follows the Core rule (every criterion met); the model's text is never the verdict.
Each case runs `EVAL_RUNS` times; every run of every case writes its scores to its own
Langfuse trace with the prompt version, model and effort. The command makes paid model
requests (capped by the spend ledger) and exits nonzero when a threshold fails in any run.

Environment: EVAL_RUNS (3), EVALUATION_EFFORT (medium), EVAL_PROVIDER (openai),
EVAL_SPLIT (all | tuning | holdout), EVAL_OUTPUT (report path), EVAL_STOP_ON_FAILURE (0),
EVAL_SPEND_LEDGER and EVAL_SPEND_CAP_USD (see evals/spend.py).
"""

import json
import os
import sys
import time
from pathlib import Path
from uuid import uuid4

from evals.quality import aggregate, threshold_failures
from evals.spend import MeteredTrace, SpendLedger
from src.evaluation.application.evaluator import EVALUATION_PROMPTS, evaluation_task, run_analysis
from src.evaluation.domain.evaluation import AnalysisContext
from src.shared.infrastructure.models import model_name, provider_model, settings_from_env
from src.shared.infrastructure.tracing import ExecutionTrace

DATASET = Path(__file__).with_name("evaluation.json")


def context_for(case: dict, step: dict) -> AnalysisContext:
    return AnalysisContext(
        sessionId=str(uuid4()),
        attemptId=str(uuid4()),
        revision=1,
        stepId=case["step"],
        objective=step["objective"],
        stepTitle=step["stepTitle"],
        files=case["files"],
        challenge=step["challenge"],
        syntax={
            "coverage": "complete",
            "checked": [{"path": path, "language": "checked"} for path in case["files"]],
            "unchecked": [],
        },
    )


def score_case(outcome: dict, case: dict) -> dict:
    """The verdict Core would reach and how it compares with the labels."""
    evaluation = outcome["evaluation"]
    verdict = "invalid"
    criteria = None

    if evaluation is not None:
        approved = all(criterion.status == "met" for criterion in evaluation.criteria)
        verdict = "approve" if approved else "reject"
        criteria = {item.id: item.status for item in evaluation.criteria}

    # Only labeled criteria are scored; ambiguous ones are left out of the dataset.
    labeled = case["criteria"]
    observed = criteria or {}
    mismatches = sorted(key for key, status in labeled.items() if observed.get(key) != status)

    return {
        "verdict": verdict,
        "correct": verdict == case["expected"],
        "criteria": criteria,
        "labeledCriteria": len(labeled),
        "labeledIds": sorted(labeled),
        "criterionMismatches": mismatches,
        "hints": evaluation.hints if evaluation else None,
        "feedback": (
            {item.id: item.feedback for item in evaluation.criteria} if evaluation else None
        ),
    }


def case_scores(result: dict) -> dict:
    """Per-case scores written to Langfuse; they must match the local report."""
    should_reject = result["expected"] == "reject"

    return {
        "correct": int(result["correct"]),
        "false_accept": int(should_reject and result["verdict"] == "approve"),
        "false_reject": int(not should_reject and result["verdict"] != "approve"),
        "criterion_accuracy": (
            round(1 - len(result["criterionMismatches"]) / result["labeledCriteria"], 3)
            if result["labeledCriteria"]
            else 1.0
        ),
    }


def write_scores(client, trace_id: str, result: dict, metadata: dict) -> None:
    for name, value in case_scores(result).items():
        client.create_score(
            name=f"eval_{name}",
            value=value,
            trace_id=trace_id,
            data_type="NUMERIC",
            metadata=metadata,
        )


def main():
    dataset = json.loads(DATASET.read_text())
    selected = set(sys.argv[1:])
    runs = int(os.environ.get("EVAL_RUNS", "3"))
    effort = os.environ.get("EVALUATION_EFFORT", "medium")
    provider = os.environ.get("EVAL_PROVIDER", "openai")
    split = os.environ.get("EVAL_SPLIT", "all")
    stop_on_failure = os.environ.get("EVAL_STOP_ON_FAILURE") == "1"

    settings = settings_from_env()
    model_id = model_name(provider, settings)
    trace = MeteredTrace(ExecutionTrace(), SpendLedger.from_env("evaluation"))
    model = provider_model(provider, evaluation_task(), settings, trace)
    configuration = {
        "suite": "evaluation",
        "dataset_version": dataset["version"],
        "prompt": EVALUATION_PROMPTS.id,
        "prompt_version": EVALUATION_PROMPTS.version,
        "provider": provider,
        "model": model_id,
        "effort": effort,
    }

    cases = [
        case
        for case in dataset["cases"]
        if (not selected or case["id"] in selected) and split in {"all", case["split"]}
    ]
    all_runs = []
    stopped_early = False

    for run in range(1, runs + 1):
        results = []

        for case in cases:
            context = context_for(case, dataset["steps"][case["step"]])
            execution_id = str(uuid4())
            started = time.monotonic()

            with trace.execution(execution_id, context.sessionId, "seymour-evaluation-eval"):
                outcome = run_analysis(
                    context,
                    effort,
                    8000,
                    model,
                    lambda: True,
                    lambda _text, _tokens: None,
                    clock=time.monotonic,
                )

            result = {
                "id": case["id"],
                "run": run,
                "split": case["split"],
                "label": case["label"],
                "edge": case.get("edge"),
                "expected": case["expected"],
                "executionId": execution_id,
                "traceId": trace.client.create_trace_id(seed=execution_id),
                "tokens": outcome["tokens"],
                "calls": outcome["calls"],
                "reason": outcome["reason"],
                "seconds": round(time.monotonic() - started, 3),
                **score_case(outcome, case),
            }
            results.append(result)

            write_scores(
                trace.client,
                result["traceId"],
                result,
                {**configuration, "case": case["id"], "split": case["split"], "run": run},
            )
            print(f"run {run} {case['id']}: {result['verdict']} ({result['expected']})", flush=True)

        all_runs.append(results)

        failures = threshold_failures(aggregate([results]), dataset["thresholds"])
        if stop_on_failure and failures:
            stopped_early = True
            break

    trace.client.flush()

    splits = aggregate(all_runs)
    failures = threshold_failures(splits, dataset["thresholds"])
    report = {
        **configuration,
        "runsRequested": runs,
        "runsCompleted": len(all_runs),
        "stoppedEarly": stopped_early,
        "cases": len(cases),
        "thresholds": dataset["thresholds"],
        "thresholdFailures": failures,
        "passed": not failures,
        "tokens": sum(result["tokens"] for run in all_runs for result in run),
        "seconds": {
            "mean": round(
                sum(result["seconds"] for run in all_runs for result in run)
                / max(1, sum(len(run) for run in all_runs)),
                3,
            ),
            "max": max((result["seconds"] for run in all_runs for result in run), default=0),
        },
        "splits": splits,
        "results": [result for run in all_runs for result in run],
    }

    text = json.dumps(report, indent=2)
    output = os.environ.get("EVAL_OUTPUT")
    if output:
        Path(output).write_text(text + "\n")

    print(json.dumps({key: report[key] for key in ("passed", "thresholdFailures", "tokens")}))

    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
