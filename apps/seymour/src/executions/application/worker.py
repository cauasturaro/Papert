"""Orchestrate authorized execution claims through injected workflow ports."""

import time

from src.executions.domain.execution import Execution, Result
from src.executions.domain.ports import (
    Control,
    EvaluationRunner,
    GenerationRunner,
    Pause,
    Publisher,
    RecommendationRunner,
    StagedResults,
    TutorRunner,
)


def staging_publisher(publish: Publisher, results: StagedResults | None) -> Publisher:
    """Stages a final result before sending it and forgets it once the send succeeded."""
    if results is None:
        return publish

    def send(result: Result) -> None:
        if not result.is_final():
            publish(result)
            return

        results.stage(result)
        publish(result)
        results.clear(result.execution_id)

    return send


def replay_staged(execution_id: str, results: StagedResults | None, publish: Publisher) -> bool:
    """Replay under the original lease so Core settles the original inference once."""
    if results is None:
        return False

    staged = results.staged(execution_id)
    if staged is None:
        return False

    publish(staged)
    results.clear(execution_id)

    return True


def run_execution(
    execution: Execution,
    control: Control,
    publish: Publisher,
    tutor_runner: TutorRunner,
    evaluation_runner: EvaluationRunner,
    generation_runner: GenerationRunner,
    recommendation_runner: RecommendationRunner,
    pause: Pause = time.sleep,
    results: StagedResults | None = None,
) -> None:
    execution_id = execution.id
    if replay_staged(execution_id, results, publish):
        return

    claim = control.claim(execution_id)
    workflow = claim.workflow()
    if workflow == "terminal":
        return

    lease = claim.lease
    context = claim.context
    budget = claim.budget
    if lease is None or context is None or budget is None:
        raise ValueError("A running claim must carry a lease, context and budget")

    final_ready = False
    staged_send = staging_publisher(publish, results)

    def send(result: Result) -> None:
        nonlocal final_ready
        final_ready = result.is_final()
        staged_send(result)

    try:
        if workflow == "analysis":
            evaluation_runner(execution_id, lease, context, budget, control, send)
            return

        if workflow == "recommendation":
            recommendation_runner(execution_id, lease, context, budget, control, send)
            return

        if workflow == "generation":
            generation_runner(execution_id, lease, context, budget, control, send)
            return

        if workflow == "tutor":
            tutor_runner(execution_id, lease, context, budget, control, send)
            return

        chunks = [
            "Your saved workspace was received. ",
            "Compare the code with the current challenge criteria. ",
            "This deterministic transport check does not evaluate or approve your solution.",
        ]
        text = ""

        for index, chunk in enumerate(chunks, start=1):
            if not control.active(execution_id, lease):
                send(Result(execution_id, lease, 100, "completed", "", 0))
                return

            text += chunk
            final = index == len(chunks)
            status = "completed" if final else "running"
            send(Result(execution_id, lease, index, status, text, 0))

            if not final:
                pause(1)
    except Exception:
        # A finished inference must remain publishable even when no retry budget remains.
        if not final_ready:
            control.failed(execution_id, lease)
        raise
