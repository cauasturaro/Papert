"""Pinned wire shapes from Core execution.ts and the Seymour worker output."""

import json
from pathlib import Path

import pytest

from src.executions.domain.execution import Result
from src.executions.infrastructure.contracts import (
    decode_execution,
    encode_result,
    execution_envelope_model,
)
from src.executions.worker import run_job

FIXTURE = json.loads((Path(__file__).parent / "fixtures/executions.json").read_text())


def test_inbound_http_and_queue_contracts_map_to_the_same_execution():
    incoming = FIXTURE["incoming"]

    envelope = execution_envelope_model()
    http = envelope.model_validate(incoming)
    job = decode_execution(incoming)

    assert str(http.executionId) == job.id == incoming["executionId"]
    assert json.loads(http.model_dump_json()) == incoming


@pytest.mark.parametrize("shape", ["running", "completed", "cancelled", "evaluation"])
def test_result_serialization_pins_all_optional_fields(shape):
    event = FIXTURE[shape]
    result = Result(
        event["executionId"],
        event["lease"],
        event["index"],
        event["status"],
        event["text"],
        event["tokens"],
        event.get("evaluation"),
    )

    encoded = encode_result(result)

    assert json.dumps(encoded) == json.dumps(event)


def test_real_worker_emits_the_pinned_transport_and_cancellation_events():
    events = []
    active = True

    def control(request):
        if request["action"] == "claim":
            return {
                "status": "running",
                "lease": FIXTURE["running"]["lease"],
                "input": {"kind": "chat"},
                "budget": 1000,
            }

        return {"active": active}

    run_job(FIXTURE["incoming"], control, events.append, lambda _: None)

    assert events[0] == FIXTURE["running"]
    assert events[-1] == FIXTURE["completed"]

    active = False
    events.clear()

    run_job(FIXTURE["incoming"], control, events.append)

    assert events == [FIXTURE["cancelled"]]
