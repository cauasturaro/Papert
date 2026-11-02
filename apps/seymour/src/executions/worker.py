"""Deterministic worker; no student code or model is executed."""

import time
from collections.abc import Callable
from typing import Any
from uuid import UUID


def run_job(
    message: dict,
    control: Callable[[dict], dict],
    publish: Callable[[dict], Any],
    pause: Callable[[float], Any] = time.sleep,
) -> None:
    if set(message) != {"version", "executionId"} or message["version"] != 1:
        raise ValueError("Unsupported execution envelope")

    execution_id = str(UUID(message["executionId"]))
    claim = control({"action": "claim", "executionId": execution_id})
    status = claim["status"]
    if status in {"completed", "cancelled", "timed_out"}:
        return
    if status != "running":
        raise RuntimeError("Execution is busy or permanently failed")

    lease = claim["lease"]
    context = claim["input"]
    if claim["budget"] != 1000 or context["kind"] not in {"chat", "analysis"}:
        raise ValueError("Invalid authorized execution context")

    chunks = [
        "Your saved workspace was received. ",
        "Compare the code with the current challenge criteria. ",
        "This deterministic transport check does not evaluate or approve your solution.",
    ]
    text = ""

    try:
        for index, chunk in enumerate(chunks, start=1):
            active = control({"action": "active", "executionId": execution_id, "lease": lease})
            if not active["active"]:
                publish(
                    {
                        "version": 1,
                        "executionId": execution_id,
                        "lease": lease,
                        "index": 100,
                        "status": "completed",
                        "text": "",
                        "tokens": 0,
                    }
                )

                return

            text += chunk
            final = index == len(chunks)
            publish(
                {
                    "version": 1,
                    "executionId": execution_id,
                    "lease": lease,
                    "index": index,
                    "status": "completed" if final else "running",
                    "text": text,
                    "tokens": 0,
                }
            )

            if not final:
                pause(1)
    except Exception:
        control({"action": "failed", "executionId": execution_id, "lease": lease})
        raise
