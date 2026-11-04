from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

pytestmark = pytest.mark.unit


@pytest.mark.asyncio
async def test_direct_http_call_cannot_forge_a_model_context():
    envelope = {"version": 1, "executionId": str(uuid4())}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        denied = await client.post("/internal/seymour/executions", json=envelope)
        forged = await client.post(
            "/internal/seymour/executions", json={**envelope, "solutionAllowed": True, "files": {}}
        )

    assert denied.status_code == 403
    assert forged.status_code == 422


@pytest.mark.parametrize("fails", [False, True])
def test_gateway_adapter_uses_the_leased_worker(monkeypatch, fails):
    import mangum_handler
    from src.executions.infrastructure import router

    calls = []

    def worker(event):
        calls.append(event)

        if fails:
            raise RuntimeError("execution failed")

    monkeypatch.setattr(router, "run_single_execution", worker)
    execution_id = str(uuid4())
    event = {
        "version": "2.0",
        "routeKey": "POST /internal/seymour/executions",
        "rawPath": "/internal/seymour/executions",
        "rawQueryString": "",
        "headers": {"content-type": "application/json", "host": "test"},
        "requestContext": {
            "http": {
                "method": "POST",
                "path": "/internal/seymour/executions",
                "sourceIp": "127.0.0.1",
                "protocol": "HTTP/1.1",
            },
            "authorizer": {"iam": {"userArn": "arn:aws:iam::123456789012:role/core"}},
        },
        "body": '{"version":1,"executionId":"' + execution_id + '"}',
        "isBase64Encoded": False,
    }

    response = mangum_handler.handler(event, object())

    assert response["statusCode"] == (503 if fails else 200)
    if fails:
        assert (
            response["body"] == '{"detail":"Execution could not complete; retry its existing ID"}'
        )
    assert calls == [{"version": 1, "executionId": execution_id}]
