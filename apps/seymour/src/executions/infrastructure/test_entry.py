import io
import json
from uuid import UUID, uuid4

import boto3
import pytest
from botocore.awsrequest import AWSResponse
from botocore.exceptions import ReadTimeoutError
from urllib3.response import HTTPResponse

from src.executions.infrastructure import entry
from src.executions.infrastructure.rpc_control import RpcControl

pytestmark = pytest.mark.unit


def test_lambda_sdk_resends_the_same_claim_after_a_committed_response_is_lost(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    monkeypatch.setenv("CORE_EXECUTION_CONTROL_FUNCTION", "core-control")
    make_client = boto3.client
    sent = []
    committed = {}
    execution_id = str(uuid4())

    def send(request):
        payload = json.loads(request.body)
        sent.append(payload)
        claim_id = payload["claimId"]
        answer = committed.setdefault(
            claim_id,
            {"status": "running", "lease": str(uuid4()), "input": {"kind": "chat"}, "budget": 1000},
        )
        # The first call committed, but its response was lost below RpcControl.
        if len(sent) == 1:
            raise ReadTimeoutError(endpoint_url=request.url)

        raw = HTTPResponse(body=io.BytesIO(json.dumps(answer).encode()), preload_content=False)

        return AWSResponse(request.url, 200, {}, raw)

    def client_for(service, **options):
        if service != "lambda":
            return None

        assert options["config"].retries == {"max_attempts": 2}
        client = make_client(service, **options)
        monkeypatch.setattr(client._endpoint.http_session, "send", send)

        return client

    monkeypatch.setattr(entry.boto3, "client", client_for)

    def run_job(message, invoke, publish):
        control = RpcControl(invoke)
        claim = control.claim(message["executionId"])
        assert claim.lease == committed[control.claim_id]["lease"]

    monkeypatch.setattr(entry, "run_job", run_job)

    entry.run_single_execution({"executionId": execution_id})
    entry.run_single_execution({"executionId": execution_id})

    assert len(sent) == 3
    assert sent[0] == sent[1]
    assert sent[2]["claimId"] != sent[0]["claimId"]
    assert all(str(UUID(payload["claimId"])) != execution_id for payload in sent)
    assert len(committed) == 2
