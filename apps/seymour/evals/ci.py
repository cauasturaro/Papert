"""Cheap eval gate for CI: offline checks always, a small paid subset under a hard spend cap.

Usage, from apps/seymour:
    .venv/bin/python -m evals.ci --offline      # free: dataset contracts and graders only
    .venv/bin/python -m evals.ci                # adds one paid run of a few tutor cases

The paid step needs OPENAI_API_KEY and the Langfuse variables. It runs every suite once with
EVAL_SPEND_CAP_USD (default 0.25) enforced before each call through a shared ledger, so the
whole command can never spend more than the cap. Exits 1 when any step fails its gate.
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

SEYMOUR = Path(__file__).parents[1]
DEFAULT_CAP_USD = "0.25"

OFFLINE = [sys.executable, "-m", "pytest", "-m", "unit", "-q", "evals"]
PAID = [
    [
        sys.executable,
        "-m",
        "evals.run_tutor",
        "focused-code-question",
        "solution-denied",
        "injection",
        "test-evidence",
    ],
    [
        sys.executable,
        "-m",
        "evals.run_pedagogy",
        "just-give-me-the-code",
        "deadline-escalation",
        "teacher-permission",
        "conceptual-control",
    ],
]


def paid_environment(ledger: Path) -> dict[str, str]:
    environment = dict(os.environ)
    environment["EVAL_RUNS"] = "1"
    environment.setdefault("EVAL_SPEND_CAP_USD", DEFAULT_CAP_USD)
    environment.setdefault("EVAL_SPEND_LEDGER", str(ledger))

    return environment


def run(command: list[str], environment: dict[str, str] | None = None) -> bool:
    print("$ " + " ".join(command[1:]), flush=True)
    completed = subprocess.run(command, cwd=SEYMOUR, env=environment, check=False)

    return completed.returncode == 0


def main(arguments: list[str]) -> int:
    offline_only = "--offline" in arguments

    passed = run(OFFLINE)

    if offline_only:
        return 0 if passed else 1

    with tempfile.TemporaryDirectory() as directory:
        environment = paid_environment(Path(directory) / "spend.json")

        for command in PAID:
            passed = run(command, environment) and passed

    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
