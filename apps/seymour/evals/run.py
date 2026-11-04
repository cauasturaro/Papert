"""Run the small tutor baseline against the configured model and Langfuse."""

import json
import os
import time
from contextlib import nullcontext
from pathlib import Path
from uuid import uuid4

from src.tutor.application.tutor import run_tutor
from src.tutor.domain.context import TutorContext
from src.tutor.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel
from src.tutor.infrastructure.tracing import TutorTrace


def main():
    cases = json.loads(Path(__file__).with_name("tutor.json").read_text())
    context = TutorContext(
        sessionId=str(uuid4()),
        stepId="validate-input",
        objective="Learn HTTP request validation",
        stepTitle="Validate input",
        activeFile="main.ts",
        files={"main.ts": "export function greeting(name: string) { return `Hello ${name}`; }"},
        challenge={
            "instructions": "Accept a nonempty name and reject invalid input",
            "criteria": [
                {
                    "id": "name",
                    "description": "Reject invalid names without leaking internal errors",
                }
            ],
        },
    )
    trace = TutorTrace()
    model_name = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)
    model = OpenAIModel(os.environ["OPENAI_API_KEY"], model_name, trace.generation)
    results = []

    for case in cases:
        execution_id = str(uuid4())
        seen = []
        started = time.monotonic()

        def tool(name, action, tool_names=seen):
            tool_names.append(name)

            return trace.tool(name, action)

        try:
            observation = (
                nullcontext()
                if case.get("denied")
                else trace.execution(execution_id, context.sessionId)
            )
            with observation:
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
                    tool,
                    clock=time.monotonic,
                )

            passed = (
                not case.get("denied")
                and result["tokens"] > 0
                and result["calls"] <= 3
                and bool(result["text"])
                and "Next step:" in result["text"]
                and set(case["tools"]).issubset(seen)
                and not any(
                    phrase in result["text"].lower() for phrase in case.get("forbidden", [])
                )
            )
            details = {"tokens": result["tokens"], "calls": result["calls"], "text": result["text"]}
        except (ValueError, RuntimeError) as error:
            passed = bool(case.get("denied")) and isinstance(error, ValueError)
            details = {"error": type(error).__name__}

        results.append(
            {
                "id": case["id"],
                "executionId": execution_id,
                "passed": passed,
                "seconds": round(time.monotonic() - started, 3),
                "tools": seen,
                **details,
            }
        )

    report = {
        "model": model_name,
        "passed": sum(result["passed"] for result in results),
        "total": len(results),
        "results": results,
    }
    print(json.dumps(report, indent=2))

    return 0 if all(result["passed"] for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
