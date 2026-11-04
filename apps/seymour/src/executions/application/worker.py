"""Orchestrate authorized execution claims through injected workflow ports."""

import time

from src.executions.application.ports import (
    Control,
    EvaluationRunner,
    GenerationRunner,
    Pause,
    Publisher,
    TutorRunner,
)
from src.executions.domain.execution import Execution, Result


def run_execution(
    execution: Execution,
    control: Control,
    publish: Publisher,
    tutor_runner: TutorRunner,
    evaluation_runner: EvaluationRunner,
    generation_runner: GenerationRunner,
    pause: Pause = time.sleep,
) -> None:
    execution_id = execution.id
    claim = control.claim(execution_id)
    workflow = claim.workflow()
    if workflow == "terminal":
        return

    lease = claim.lease

    try:
        if workflow == "analysis":
            evaluation_runner(execution_id, lease, claim.context, claim.budget, control, publish)
            return

        if workflow == "generation":
            generation_runner(execution_id, lease, claim.context, claim.budget, control, publish)
            return

        if workflow == "tutor":
            tutor_runner(execution_id, lease, claim.context, claim.budget, control, publish)
            return

        chunks = [
            "Your saved workspace was received. ",
            "Compare the code with the current challenge criteria. ",
            "This deterministic transport check does not evaluate or approve your solution.",
        ]
        text = ""

        for index, chunk in enumerate(chunks, start=1):
            if not control.active(execution_id, lease):
                publish(Result(execution_id, lease, 100, "completed", "", 0))
                return

            text += chunk
            final = index == len(chunks)
            status = "completed" if final else "running"
            publish(Result(execution_id, lease, index, status, text, 0))

            if not final:
                pause(1)
    except Exception:
        control.failed(execution_id, lease)
        raise
