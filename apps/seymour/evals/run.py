"""Tutor modes and adversarial prompts against the real model, repeated `EVAL_RUNS` times.

A case passes when the answer is valid guidance, uses the required tools, avoids forbidden
phrases, and denied modes are refused before any model call. Each run writes an
`eval_passed` score to the execution's Langfuse trace with the prompt version, model and
effort, and the report lists real cached input tokens per call (prompt caching).

Environment: EVAL_RUNS (3), EVAL_PROVIDER (openai), EVAL_OUTPUT, EVAL_SPEND_LEDGER and
EVAL_SPEND_CAP_USD.
"""

import json
import os
import sys
import time
from contextlib import nullcontext
from pathlib import Path
from uuid import uuid4

from evals.spend import MeteredTrace, SpendLedger
from src.shared.infrastructure.models import model_name, provider_model, settings_from_env
from src.shared.infrastructure.tracing import ExecutionTrace
from src.tutor.application.guidance import guidance_task
from src.tutor.application.prompts import TUTOR_PROMPTS
from src.tutor.application.tools import TOOL_ARGUMENTS
from src.tutor.application.tutor import run_tutor
from src.tutor.domain.context import TutorContext

FILES = {"main.ts": "export function greeting(name: string) { return `Hello ${name}`; }"}


def context_for(case: dict) -> TutorContext:
    return TutorContext(
        sessionId=str(uuid4()),
        stepId="validate-input",
        objective="Learn HTTP request validation",
        stepTitle="Validate input",
        activeFile="main.ts",
        files=case.get("files", FILES),
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


def run_case(case, model, trace, tool_log):
    context = context_for(case)
    execution_id = str(uuid4())

    def tool(name, action):
        tool_log.append(name)

        return trace.tool(name, action)

    observation = (
        nullcontext() if case.get("denied") else trace.execution(execution_id, context.sessionId)
    )

    try:
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
    except (ValueError, RuntimeError) as error:
        passed = bool(case.get("denied")) and isinstance(error, ValueError)

        return execution_id, passed, {"error": type(error).__name__}

    text = result["text"].lower()
    passed = (
        not case.get("denied")
        and result["tokens"] > 0
        and result["calls"] <= 3
        and "next step:" in text
        and set(case["tools"]).issubset(tool_log)
        and not any(phrase in text for phrase in case.get("forbidden", []))
    )

    return (
        execution_id,
        passed,
        {
            "tokens": result["tokens"],
            "calls": result["calls"],
            "text": result["text"],
        },
    )


def main():
    cases = json.loads(Path(__file__).with_name("tutor.json").read_text())
    selected = set(sys.argv[1:])
    runs = int(os.environ.get("EVAL_RUNS", "3"))
    provider = os.environ.get("EVAL_PROVIDER", "openai")

    settings = settings_from_env()
    trace = MeteredTrace(ExecutionTrace(TOOL_ARGUMENTS), SpendLedger.from_env("tutor"))
    model = provider_model(provider, guidance_task(), settings, trace)
    configuration = {
        "suite": "tutor",
        "prompt": TUTOR_PROMPTS.id,
        "prompt_version": TUTOR_PROMPTS.version,
        "provider": provider,
        "model": model_name(provider, settings),
        "cache_key": getattr(model, "cache_key", None),
    }
    results = []

    for run in range(1, runs + 1):
        for case in cases:
            if selected and case["id"] not in selected:
                continue

            tools = []
            before = len(trace.usages)
            started = time.monotonic()

            execution_id, passed, details = run_case(case, model, trace, tools)

            calls = [
                {"input": usage.input, "cached": usage.cached, "output": usage.output}
                for _call, usage in trace.usages[before:]
            ]
            result = {
                "id": case["id"],
                "run": run,
                "effort": case["effort"],
                "executionId": execution_id,
                "passed": passed,
                "seconds": round(time.monotonic() - started, 3),
                "tools": tools,
                "modelCalls": calls,
                **details,
            }
            results.append(result)

            if not case.get("denied"):
                trace.client.create_score(
                    name="eval_passed",
                    value=int(passed),
                    trace_id=trace.client.create_trace_id(seed=execution_id),
                    data_type="NUMERIC",
                    metadata={**configuration, "case": case["id"], "run": run},
                )

            print(f"run {run} {case['id']}: {'pass' if passed else 'FAIL'}", flush=True)

    trace.client.flush()

    usages = [usage for _call, usage in trace.usages]
    by_case = {}
    for result in results:
        by_case.setdefault(result["id"], []).append(result["passed"])

    report = {
        **configuration,
        "runs": runs,
        "passed": sum(result["passed"] for result in results),
        "total": len(results),
        "worstRunPassed": min(
            sum(result["passed"] for result in results if result["run"] == run)
            for run in range(1, runs + 1)
        ),
        "casesPerRun": len(results) // runs,
        "consistentCases": sum(len(set(values)) == 1 for values in by_case.values()),
        "cache": {
            "calls": len(usages),
            "callsWithCacheRead": sum(usage.cached > 0 for usage in usages),
            "inputTokens": sum(usage.input for usage in usages),
            "cachedTokens": sum(usage.cached for usage in usages),
        },
        "results": results,
    }

    text = json.dumps(report, indent=2)
    output = os.environ.get("EVAL_OUTPUT")
    if output:
        Path(output).write_text(text + "\n")

    summary = {key: report[key] for key in ("passed", "total", "worstRunPassed", "cache")}
    print(json.dumps(summary))

    return 0 if all(result["passed"] for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
