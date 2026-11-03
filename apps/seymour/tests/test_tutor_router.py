from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


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


def test_gateway_adapter_uses_the_leased_worker(monkeypatch):
    import mangum_handler
    from src.tutor.infrastructure import router

    calls = []

    def worker(event, _context):
        calls.append(event)

        return {"batchItemFailures": []}

    monkeypatch.setattr(router, "handler", worker)
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

    assert response["statusCode"] == 200
    assert calls[0]["Records"][0]["messageId"] == execution_id
