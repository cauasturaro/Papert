import json
from pathlib import Path

import pytest

from src.executions.application.contracts.transport import (
    decode_execution,
    encode_result,
    execution_envelope_model,
)
from src.executions.domain.execution import Result

pytestmark = pytest.mark.unit

FIXTURE_PATH = Path(__file__).parents[4] / "tests/fixtures/executions.json"
FIXTURE = json.loads(FIXTURE_PATH.read_text())


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


def test_grounding_travels_in_the_result_event():
    grounding = {"support": "unsupported", "citations": []}
    result = Result("execution", "lease", 100, "completed", "text", 10, grounding=grounding)

    event = encode_result(result)

    assert event["grounding"] == grounding
    assert "grounding" not in encode_result(Result("execution", "lease", 1, "running", "", 0))


def test_roadmap_travels_only_on_events_that_carry_it():
    roadmap = {"definition": {"title": "x"}, "evidence": []}
    event = encode_result(
        Result("execution", "lease", 100, "completed", "text", 10, roadmap=roadmap)
    )

    assert event["roadmap"] == roadmap
    assert "roadmap" not in encode_result(Result("execution", "lease", 1, "running", "", 0))


def test_memory_travels_only_on_events_that_carry_it():
    memory = {"summary": {"covered": ["ports"], "pending": [], "struggles": []}}
    event = encode_result(Result("execution", "lease", 100, "completed", "text", 10, memory=memory))

    assert event["memory"] == memory
    assert "memory" not in encode_result(Result("execution", "lease", 1, "running", "", 0))
