"""The maintenance CLI publishes the same reindex envelope the consumer decodes."""

import json
from contextlib import nullcontext
from pathlib import Path
from unittest.mock import Mock

import pytest

from src.infrastructure import reindex

pytestmark = pytest.mark.unit
CONTRACTS = Path(__file__).resolve().parents[4] / "contracts"


def test_reindex_producer_matches_shared_sqs_body(monkeypatch):
    fixture = json.loads((CONTRACTS / "ingestion-reindex-event/fixtures.json").read_text())
    record = fixture["valid"][0]["payload"]
    payload = json.loads(record["body"])
    queue = Mock()
    monkeypatch.setattr("sys.argv", ["reindex", "--queue-url", "https://queue.test/ingestion"])
    monkeypatch.setattr(reindex, "connect", lambda: nullcontext(object()))
    monkeypatch.setattr(
        reindex, "inventory", lambda connection, model: [payload["PapertReindex"]["documentId"]]
    )
    monkeypatch.setattr(reindex.boto3, "client", lambda service: queue)

    reindex.main()

    queue.send_message.assert_called_once()
    sent = queue.send_message.call_args.kwargs
    assert sent["QueueUrl"] == "https://queue.test/ingestion"
    assert json.loads(sent["MessageBody"]) == payload
