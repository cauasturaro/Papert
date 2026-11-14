"""Replay learner-reported answers as evals: each treated case reruns through the tutor graph.

A case file in evals/fixtures/reported/ holds the admitted tutor context of a reported answer
after human treatment (`treated: true`, personal data removed) and the checks that define a
correct answer (`forbidden` phrases, `required` phrases). Untreated cases are refused.

Usage: python -m evals.run_reported [case.json ...]   (paid; EVAL_RUNS, EVAL_SPEND_LEDGER)
"""

import json
import os
import sys
import time
from pathlib import Path
from uuid import uuid4

from evals.spend import MeteredTrace, SpendLedger
from src.shared.infrastructure.models import provider_model, settings_from_env
from src.shared.infrastructure.tracing import ExecutionTrace
from src.tutor.application.guidance import guidance_task
from src.tutor.application.prompts import TUTOR_PROMPTS
from src.tutor.application.tools import TOOL_ARGUMENTS
from src.tutor.application.tutor import run_tutor
from src.tutor.domain.context import TutorContext

FIXTURES = Path(__file__).parent / "fixtures" / "reported"


def load(path: Path) -> dict:
    case = json.loads(path.read_text())

    if case.get("treated") is not True:
        raise ValueError(f"{path.name} has not been treated for personal data")

    return case


def passed(case: dict, text: str) -> bool:
    lowered = text.lower()
    forbidden = any(phrase.lower() in lowered for phrase in case["check"].get("forbidden", []))
    required = all(phrase.lower() in lowered for phrase in case["check"].get("required", []))

    return "next step:" in lowered and required and not forbidden


def main():
    paths = [Path(argument) for argument in sys.argv[1:]] or sorted(FIXTURES.glob("*.json"))
    runs = int(os.environ.get("EVAL_RUNS", "3"))
    provider = os.environ.get("EVAL_PROVIDER", "openai")

    trace = MeteredTrace(ExecutionTrace(TOOL_ARGUMENTS), SpendLedger.from_env("reported"))
    model = provider_model(provider, guidance_task(), settings_from_env(), trace)
    results = []

    for path in paths:
        case = load(path)

        for run in range(1, runs + 1):
            context = TutorContext.model_validate({**case["context"], "sessionId": str(uuid4())})
            execution_id = str(uuid4())

            with trace.execution(execution_id, context.sessionId):
                result = run_tutor(
                    context,
                    case["prompt"],
                    case["mode"],
                    case["effort"],
                    case.get("solutionAllowed", False),
                    8000,
                    model,
                    lambda: True,
                    lambda _text, _tokens: None,
                    trace.tool,
                    clock=time.monotonic,
                )

            ok = passed(case, result["text"])
            # The local report keeps the answer for review; traces never receive it.
            results.append(
                {
                    "id": case["id"],
                    "run": run,
                    "passed": ok,
                    "tokens": result["tokens"],
                    "text": result["text"],
                }
            )
            print(f"run {run} {case['id']}: {'pass' if ok else 'FAIL'}", flush=True)

    trace.client.flush()

    report = {
        "suite": "reported",
        "prompt_version": TUTOR_PROMPTS.version,
        "provider": provider,
        "results": results,
    }
    text = json.dumps(report, indent=2)
    output = os.environ.get("EVAL_OUTPUT")
    if output:
        Path(output).write_text(text + "\n")

    print(json.dumps([(result["id"], result["run"], result["passed"]) for result in results]))

    return 0 if all(result["passed"] for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
