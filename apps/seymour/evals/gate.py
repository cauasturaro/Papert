"""Shared eval gate: threshold checks, the command's exit status and dataset identity."""

import hashlib
import json
import sys


def at_least(name: str, value: float | None, minimum: float) -> list[str]:
    if value is None or value < minimum:
        return [f"{name} {value} is below {minimum}"]

    return []


def at_most(name: str, value: float | None, maximum: float) -> list[str]:
    if value is None or value > maximum:
        return [f"{name} {value} is above {maximum}"]

    return []


def exit_status(failures: list[str]) -> int:
    """1 when any gate failed, so CI and shell pipelines see the regression."""
    for failure in failures:
        print(f"gate failed: {failure}", file=sys.stderr)

    return 1 if failures else 0


def content_hash(data) -> str:
    """Identity of the cases a report measured; editing a case changes it without a version bump."""
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))

    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
