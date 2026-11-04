import pytest

pytestmark = pytest.mark.unit


def test_lambda_reports_only_failed_batch_items(monkeypatch):
    from src.executions.infrastructure import sqs as worker_handler

    seen = []

    def run(message):
        seen.append(message["id"])
        if message["id"] == "bad":
            raise ValueError("invalid envelope")

    monkeypatch.setattr(worker_handler, "run_single_execution", run)
    records = [{"messageId": key, "body": '{"id":"' + key + '"}'} for key in ["bad", "good"]]

    result = worker_handler.handler({"Records": records}, None)

    assert result == {"batchItemFailures": [{"itemIdentifier": "bad"}]}
    assert seen == ["bad", "good"]
