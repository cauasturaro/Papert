"""Measure false accepts and false rejects of the evaluation graph on the labeled dataset.

Approval follows the Core rule (every criterion met); the model's text is never the verdict.
The command makes paid model requests and exits nonzero when a recorded threshold fails.
"""

import json
import os
import sys
import time
from pathlib import Path
from uuid import uuid4

from src.evaluation.application.evaluator import run_analysis
from src.evaluation.domain.evaluation import AnalysisContext, ModelEvaluation
from src.tutor.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
from src.tutor.infrastructure.tracing import TutorTrace


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


def main():
    dataset = json.loads(Path(__file__).with_name("evaluation.json").read_text())
    selected = set(sys.argv[1:])
    effort = os.environ.get("EVALUATION_EFFORT", "medium")
    trace = TutorTrace()
    model_name = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)
    model = OpenAIModel(
        os.environ["OPENAI_API_KEY"],
        model_name,
        trace.generation,
        "attempt_evaluation",
        ModelEvaluation.model_json_schema(),
    )
    results = []

    for case in dataset["cases"]:
        if selected and case["id"] not in selected:
            continue

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

        results.append(
            {
                "id": case["id"],
                "label": case["label"],
                "expected": case["expected"],
                "verdict": verdict,
                "correct": verdict == case["expected"],
                "tokens": outcome["tokens"],
                "calls": outcome["calls"],
                "seconds": round(time.monotonic() - started, 3),
                "criteria": criteria,
                "labeledCriteria": len(labeled),
                "criterionMismatches": mismatches,
                "hints": evaluation.hints if evaluation else None,
            }
        )

    # An invalid evaluation never approves; it counts as a rejection for the expected label.
    should_approve = [result for result in results if result["expected"] == "approve"]
    should_reject = [result for result in results if result["expected"] == "reject"]
    cross_file = [result for result in results if result["label"] == "cross_file_violation"]
    labeled_criteria = sum(result["labeledCriteria"] for result in results)
    criterion_mismatches = sum(len(result["criterionMismatches"]) for result in results)
    false_accepts = sum(result["verdict"] == "approve" for result in should_reject)
    false_rejects = sum(result["verdict"] != "approve" for result in should_approve)
    metrics = {
        "falseAcceptRate": round(false_accepts / len(should_reject), 3) if should_reject else 0,
        "falseRejectRate": round(false_rejects / len(should_approve), 3) if should_approve else 0,
        "crossFileRejections": (
            round(sum(r["verdict"] != "approve" for r in cross_file) / len(cross_file), 3)
            if cross_file
            else 1.0
        ),
        "criterionAccuracy": (
            round(1 - criterion_mismatches / labeled_criteria, 3) if labeled_criteria else 1.0
        ),
        "invalid": sum(result["verdict"] == "invalid" for result in results),
    }
    thresholds = dataset["thresholds"]
    passed = (
        metrics["falseAcceptRate"] <= thresholds["maxFalseAcceptRate"]
        and metrics["falseRejectRate"] <= thresholds["maxFalseRejectRate"]
        and metrics["crossFileRejections"] >= thresholds["minCrossFileRejections"]
        and metrics["criterionAccuracy"] >= thresholds["minCriterionAccuracy"]
    )
    report = {
        "model": model_name,
        "effort": effort,
        "total": len(results),
        "accuracy": round(sum(result["correct"] for result in results) / len(results), 3),
        "metrics": metrics,
        "thresholds": thresholds,
        "passed": passed,
        "tokens": sum(result["tokens"] for result in results),
        "results": results,
    }
    print(json.dumps(report, indent=2))

    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
