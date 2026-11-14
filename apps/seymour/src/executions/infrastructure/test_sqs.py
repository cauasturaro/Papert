import logging
from uuid import uuid4

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


def test_a_failed_message_is_logged_with_its_correlation_ids(monkeypatch, caplog):
    from src.executions.infrastructure import sqs as worker_handler

    execution_id = str(uuid4())

    def run(_message):
        raise RuntimeError("Core execution control failed")

    monkeypatch.setattr(worker_handler, "run_single_execution", run)
    record = {
        "messageId": "message-1",
        "body": '{"version":1,"executionId":"' + execution_id + '"}',
        "attributes": {"ApproximateReceiveCount": "2"},
    }

    with caplog.at_level(logging.ERROR):
        worker_handler.handler({"Records": [record]}, None)

    [entry] = caplog.records
    assert entry.msg == "execution_failed"
    assert entry.executionId == execution_id
    assert entry.messageId == "message-1"
    assert entry.receiveCount == 2
    assert entry.exc_info[0] is RuntimeError


def test_a_malformed_body_is_logged_without_an_execution_id(monkeypatch, caplog):
    from src.executions.infrastructure import sqs as worker_handler

    record = {"messageId": "message-2", "body": "{not json"}

    with caplog.at_level(logging.ERROR):
        result = worker_handler.handler({"Records": [record]}, None)

    [entry] = caplog.records
    assert result == {"batchItemFailures": [{"itemIdentifier": "message-2"}]}
    assert not hasattr(entry, "executionId")
    assert entry.receiveCount is None
