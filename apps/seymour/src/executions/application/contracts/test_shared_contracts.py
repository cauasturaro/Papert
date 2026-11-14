"""Exercise the same wire examples consumed by Core's contract tests."""

import json
from pathlib import Path

import pytest

from src.executions.application.contracts.transport import (
    decode_execution,
    encode_result,
    execution_envelope_model,
)
from src.executions.domain.execution import Result
from src.executions.infrastructure.rpc_control import RpcControl

pytestmark = pytest.mark.unit
CONTRACTS = Path(__file__).resolve().parents[6] / "contracts"


def fixtures(name):
    return json.loads((CONTRACTS / name / "fixtures.json").read_text())


@pytest.mark.parametrize("case", fixtures("execution-job")["valid"], ids=lambda case: case["name"])
def test_job_consumers_accept_shared_envelope(case):
    payload = case["payload"]

    execution = decode_execution(payload)
    http = execution_envelope_model().model_validate(payload)

    assert execution.id == payload["executionId"]
    assert json.loads(http.model_dump_json()) == payload


@pytest.mark.parametrize(
    "case", fixtures("execution-job")["invalid"], ids=lambda case: case["name"]
)
def test_job_consumers_reject_shared_invalid_envelopes(case):
    assert case["rejection"] == {"service": "seymour", "exception": "ValueError"}

    with pytest.raises(ValueError):
        decode_execution(case["payload"])

    with pytest.raises(ValueError):
        execution_envelope_model().model_validate(case["payload"])


@pytest.mark.parametrize("case", fixtures("worker-event")["valid"], ids=lambda case: case["name"])
def test_result_producer_matches_core_examples(case):
    payload = case["payload"]
    result = Result(
        execution_id=payload["executionId"],
        lease=payload["lease"],
        index=payload["index"],
        status=payload["status"],
        text=payload["text"],
        tokens=payload["tokens"],
        evaluation=payload.get("evaluation"),
        grounding=payload.get("grounding"),
        roadmap=payload.get("roadmap"),
        recommendation=payload.get("recommendation"),
        memory=payload.get("memory"),
    )

    encoded = encode_result(result)

    assert encoded == payload
    assert {key: type(value) for key, value in encoded.items()} == {
        key: type(value) for key, value in payload.items()
    }


RPC_CASES = [
    case
    for action in ("claim", "active", "failed", "sources")
    for case in fixtures(f"execution-{action}")["valid"]
]


@pytest.mark.parametrize(
    "case", RPC_CASES, ids=lambda case: f"{case['request']['action']}-{case['name']}"
)
def test_rpc_request_producer_and_answer_consumer(case, monkeypatch):
    request = case["request"]
    answer = case["response"]
    sent = []

    def invoke(payload):
        sent.append(payload)
        return answer

    if "claimId" in request:
        monkeypatch.setattr(
            "src.executions.infrastructure.rpc_control.uuid4", lambda: request["claimId"]
        )

    control = RpcControl(invoke)
    action = request["action"]
    arguments = [request["executionId"]]
    if "lease" in request:
        arguments.append(request["lease"])

    method = control.live_sources if action == "sources" else getattr(control, action)
    decoded = method(*arguments)

    assert sent == [request]
    if action == "claim":
        assert decoded.status == answer["status"]
        assert decoded.lease == answer.get("lease")
        assert decoded.context == answer.get("input")
        assert decoded.budget == answer.get("budget")
        if decoded.status != "busy":
            expected = "terminal"
            if decoded.status == "running":
                expected = {
                    "chat": "tutor" if "mode" in answer["input"] else "transport",
                    "analysis": "analysis",
                    "generation": "generation",
                    "recommendation": "recommendation",
                }[answer["input"]["kind"]]
            assert decoded.workflow() == expected
    elif action == "active":
        assert decoded is answer["active"]
    elif action == "sources":
        assert decoded == answer["sourceIds"]
    else:
        assert decoded is None
