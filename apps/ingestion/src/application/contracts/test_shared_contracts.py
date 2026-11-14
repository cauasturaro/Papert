"""Shared Core RPC and S3/SQS examples exercised by the production adapters."""

import json
from dataclasses import asdict
from pathlib import Path

import pytest

from src.application.contracts.events import decode_record
from src.domain.control import Begin, Complete, Fail, Reindex, Removal
from src.infrastructure.control import RpcControl

pytestmark = pytest.mark.unit
CONTRACTS = Path(__file__).resolve().parents[5] / "contracts"


def fixtures(name):
    return json.loads((CONTRACTS / name / "fixtures.json").read_text())


RPC_CASES = [
    case
    for action in ("begin", "complete", "fail", "removal", "reindex")
    for case in fixtures(f"ingestion-{action}")["valid"]
]


@pytest.mark.parametrize(
    "case", RPC_CASES, ids=lambda case: f"{case['request']['action']}-{case['name']}"
)
def test_rpc_builders_and_response_parsers_share_core_contract(case):
    request = case["request"]
    answer = case["response"]
    action = request["action"]
    sent = []

    def invoke(payload):
        sent.append(payload)
        return answer

    control = RpcControl(invoke)
    if action == "begin":
        model = Begin(
            request["bucket"],
            request["key"],
            request["versionId"],
            request["sequencer"],
            request["size"],
        )
    elif action == "complete":
        model = Complete(
            request["documentId"],
            request["versionId"],
            request["sequencer"],
            request["chunkCount"],
            request["characterCount"],
            request["pageCount"],
            request["embeddingTokens"],
            request["warnings"],
        )
    elif action == "fail":
        model = Fail(
            request["documentId"], request["versionId"], request["sequencer"], request["code"]
        )
    elif action == "removal":
        model = Removal(request["bucket"], request["key"])
    else:
        model = Reindex(request["documentId"])

    decoded = getattr(control, action)(model)

    assert sent == [request]
    assert {key: type(value) for key, value in sent[0].items()} == {
        key: type(value) for key, value in request.items()
    }
    if action in {"begin", "reindex"}:
        assert asdict(decoded) == {
            "outcome": answer["outcome"],
            "document_id": answer.get("documentId"),
            "workspace_id": answer.get("workspaceId"),
            "format": answer.get("format"),
            "reason": answer.get("reason"),
            "bucket": answer.get("bucket"),
            "key": answer.get("key"),
            "version_id": answer.get("versionId"),
            "sequencer": answer.get("sequencer"),
        }
    elif action in {"complete", "fail"}:
        assert decoded.accepted is answer["accepted"]
        assert decoded.deleted is answer["deleted"]
    else:
        assert decoded.document_id == answer["documentId"]
        assert decoded.workspace_id == answer["workspaceId"]
        assert decoded.deleted is answer["deleted"]


EVENT_CASES = [
    case for name in ("ingestion-s3", "ingestion-reindex-event") for case in fixtures(name)["valid"]
]
INVALID_EVENTS = [
    case
    for name in ("ingestion-s3", "ingestion-reindex-event")
    for case in fixtures(name)["invalid"]
]


@pytest.mark.parametrize("case", EVENT_CASES, ids=lambda case: case["name"])
def test_sqs_consumer_decodes_shared_events(case):
    decoded = decode_record(case["payload"])

    assert json.loads(json.dumps(asdict(decoded))) == case["decoded"]


@pytest.mark.parametrize("case", INVALID_EVENTS, ids=lambda case: case["name"])
def test_sqs_consumer_rejects_shared_invalid_events(case):
    rejection = case["rejection"]
    assert rejection["service"] == "ingestion"
    error = {"ValueError": ValueError, "KeyError": KeyError}[rejection["exception"]]

    with pytest.raises(error):
        decode_record(case["payload"])
