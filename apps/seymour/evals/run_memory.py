"""Measure the tutor's memory behavior with the real model, several runs per case.

- proposals: does guidance propose a durable note only for lasting preferences or recurring
  difficulties? Reports the model's raw proposals and what the server filter keeps.
- preference_use: does an approved note change the next answer, compared with no note?
- long_conversation: after Core-style compaction of 14 turns, do probes about the step, the
  pending actions and the struggle still find them? Also reports summary fallbacks and tokens.

The command makes paid model requests. Usage, from apps/seymour with `.env` and `.env.langfuse`
loaded:
    MEMORY_RUNS=3 .venv/bin/python -u -m evals.run_memory [proposals|preference_use|long_conversation]
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

from evals.gate import at_least, at_most, exit_status
from evals.memory_runtime import Runtime, context_of, load, normalized
from src.tutor.application.summary import summarize

RUNS = int(os.environ.get("MEMORY_RUNS", "3"))
# Core's window policy (executions/domain/conversation-window.ts), replayed offline.
WINDOW_TURNS = 4
FOLD_TRIGGER = 7
FOLD_BATCH = 3


def run_proposals(runtime):
    dataset = load("proposals")
    rows = []

    for case in dataset["cases"]:
        for run in range(RUNS):
            context = context_of(dataset["step"], recentTurns=case.get("recentTurns", []))
            result, guidance = runtime.ask(context, case["prompt"], case["mode"])

            raw_kind = guidance.remember_kind if guidance else "invalid"
            kept = result["proposal"]
            kept_kind = kept["kind"] if kept else "none"
            terms_found = None
            if kept and case["expectedTerms"]:
                terms_found = any(term in kept["text"].lower() for term in case["expectedTerms"])

            rows.append(
                {
                    "id": case["id"],
                    "run": run,
                    "expected": case["expected"],
                    "raw": raw_kind,
                    "rawText": guidance.remember_text if guidance else None,
                    "kept": kept_kind,
                    "keptText": kept["text"] if kept else None,
                    "termsFound": terms_found,
                    "tokens": result["tokens"],
                }
            )
            print(
                f"proposals {case['id']} #{run}: expected={case['expected']} raw={raw_kind} kept={kept_kind}"
            )

    positives = [row for row in rows if row["expected"] != "none"]
    negatives = [row for row in rows if row["expected"] == "none"]
    proposed = [row for row in rows if row["kept"] != "none"]
    exact = [row for row in positives if row["kept"] == row["expected"]]

    return {
        "runs": len(rows),
        "recall": len([row for row in positives if row["kept"] != "none"]) / len(positives),
        "kindAccuracyOnPositives": len(exact) / len(positives),
        "precision": (
            len([row for row in proposed if row["expected"] != "none"]) / len(proposed)
            if proposed
            else None
        ),
        "falsePositiveRate": len([row for row in negatives if row["kept"] != "none"])
        / len(negatives),
        "rawFalsePositiveRate": (
            len([row for row in negatives if row["raw"] not in {"none", "invalid"}])
            / len(negatives)
        ),
        "serverFilterRemoved": len(
            [row for row in rows if row["raw"] not in {"none", "invalid"} and row["kept"] == "none"]
        ),
        "rows": rows,
    }


def run_preference_use(runtime):
    dataset = load("preference_use")
    rows = []

    for case in dataset["cases"]:
        pattern = re.compile(case["check"]["pattern"], re.IGNORECASE)

        for run in range(RUNS):
            context = context_of(dataset["step"], memory=case["memory"])
            result, _guidance = runtime.ask(context, case["prompt"], case["mode"])
            hit = bool(pattern.search(result["text"]))

            rows.append(
                {
                    "id": case["id"],
                    "run": run,
                    "control": case["control"],
                    "hit": hit,
                    "tokens": result["tokens"],
                    "text": result["text"],
                }
            )
            print(f"preference_use {case['id']} #{run}: control={case['control']} hit={hit}")

    with_memory = [row for row in rows if not row["control"]]
    control = [row for row in rows if row["control"]]

    return {
        "runs": len(rows),
        "hitRateWithMemory": sum(row["hit"] for row in with_memory) / len(with_memory),
        "hitRateControl": sum(row["hit"] for row in control) / len(control) if control else None,
        "rows": rows,
    }


def compact(runtime, step, turns):
    """Folds turns the way Core and Seymour would across successive requests."""
    summary = None
    unsummarized = list(turns)
    folds = []

    while len(unsummarized) >= FOLD_TRIGGER:
        folded = unsummarized[:FOLD_BATCH]
        context = context_of(step, summary=summary, foldTurns=folded)
        content, tokens, fallback = summarize(
            context, runtime.summarizer, 8000, time.monotonic() + 20, lambda: True, time.monotonic
        )
        summary = {**content.model_dump(), "stepId": step["stepId"]}
        unsummarized = unsummarized[FOLD_BATCH:]
        folds.append({"tokens": tokens, "fallback": fallback, "summary": summary})

    return summary, unsummarized[-WINDOW_TURNS:], folds


def run_long_conversation(runtime):
    dataset = load("long_conversation")
    rows = []
    pending_probe = next(probe for probe in dataset["probes"] if probe["id"] == "pending-actions")
    retention = []

    for run in range(RUNS):
        summary, recent, folds = compact(runtime, dataset["step"], dataset["turns"])
        print(
            f"long_conversation #{run}: folds={len(folds)} fallbacks={sum(f['fallback'] for f in folds)}"
        )

        # Does the stored summary itself still hold each pending action from the folded turns?
        kept = normalized(" ".join(summary["pending"])) if summary else ""
        retention.append(
            [
                any(normalized(term) in kept for term in group)
                for group in pending_probe["expectAny"]
            ]
        )

        for probe in dataset["probes"]:
            context = context_of(dataset["step"], summary=summary, recentTurns=recent)
            result, _guidance = runtime.ask(context, probe["prompt"])
            text = normalized(result["text"])
            groups = [
                any(normalized(alternative) in text for alternative in group)
                for group in probe["expectAny"]
            ]

            rows.append(
                {
                    "probe": probe["id"],
                    "run": run,
                    "passed": all(groups),
                    "groups": groups,
                    "tokens": result["tokens"],
                    "text": result["text"],
                    "summary": summary,
                    "folds": [{k: f[k] for k in ("tokens", "fallback")} for f in folds],
                }
            )
            print(
                f"  {probe['id']}: passed={all(groups)} groups={groups} tokens={result['tokens']}"
            )

    by_probe = {}
    for row in rows:
        by_probe.setdefault(row["probe"], []).append(row["passed"])

    retained = [value for groups in retention for value in groups]

    return {
        "runs": RUNS,
        "summaryPendingRetention": sum(retained) / len(retained),
        "passRate": sum(row["passed"] for row in rows) / len(rows),
        "passRateByProbe": {probe: sum(values) / len(values) for probe, values in by_probe.items()},
        "maxTokens": max(row["tokens"] for row in rows),
        "rows": rows,
    }


# Regression floors a few points under the last measured run, not quality targets: the
# long-conversation probe pass rate is a known weakness and stays reported, not gated.
THRESHOLDS = {
    "proposals": {"minRecall": 0.75, "maxFalsePositiveRate": 0.15},
    "preference_use": {"minLift": 0.1},
    "long_conversation": {"minSummaryPendingRetention": 0.9},
}


def gate_failures(report: dict) -> list[str]:
    failures = []
    proposals = report.get("proposals")
    preference = report.get("preference_use")
    conversation = report.get("long_conversation")

    if proposals is not None:
        limits = THRESHOLDS["proposals"]
        failures += at_least("proposals recall", proposals["recall"], limits["minRecall"])
        failures += at_most(
            "proposals falsePositiveRate",
            proposals["falsePositiveRate"],
            limits["maxFalsePositiveRate"],
        )

    if preference is not None:
        control = preference["hitRateControl"] or 0.0
        lift = round(preference["hitRateWithMemory"] - control, 3)
        failures += at_least("preference_use lift", lift, THRESHOLDS["preference_use"]["minLift"])

    if conversation is not None:
        failures += at_least(
            "long_conversation summaryPendingRetention",
            conversation["summaryPendingRetention"],
            THRESHOLDS["long_conversation"]["minSummaryPendingRetention"],
        )

    return failures


SUITES = {
    "proposals": run_proposals,
    "preference_use": run_preference_use,
    "long_conversation": run_long_conversation,
}


def main():
    selected = sys.argv[1:] or list(SUITES)
    runtime = Runtime()
    report: dict[str, Any] = {"model": runtime.model_name, "runsPerCase": RUNS}

    for name in selected:
        report[name] = SUITES[name](runtime)

    report["providerRetries"] = runtime.retries

    output = os.environ.get("MEMORY_OUTPUT")
    if output:
        Path(output).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")

    summary: dict[str, Any] = {
        name: {key: value for key, value in report[name].items() if key != "rows"}
        for name in selected
    }
    summary["providerRetries"] = runtime.retries
    print(json.dumps(summary, indent=2))

    return exit_status(gate_failures(report))


if __name__ == "__main__":
    raise SystemExit(main())
