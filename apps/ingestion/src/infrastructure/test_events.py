import json
from contextlib import contextmanager, nullcontext
from pathlib import Path
from unittest.mock import Mock

import pytest

from src.domain.ports import Embedded, Ports
from src.infrastructure.control import RpcControl
from src.infrastructure.events import process_batch, process_record
from src.infrastructure.extraction import DocumentExtractor

pytestmark = pytest.mark.unit

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures"
DOCUMENT = "11111111-1111-4111-8111-111111111111"
WORKSPACE = "22222222-2222-4222-8222-222222222222"
KEY = f"documents/{DOCUMENT}/original.md"


class FakeControl:
    def __init__(self, begin=None, complete=None, removal=None, reindex=None):
        self.calls = []
        self.reindex = reindex or {
            "outcome": "process",
            "documentId": DOCUMENT,
            "workspaceId": WORKSPACE,
            "format": "md",
            "bucket": "papert-sources",
            "key": KEY,
            "versionId": "v1",
            "sequencer": "00A1",
        }
        self.begin = begin or {
            "outcome": "process",
            "documentId": DOCUMENT,
            "workspaceId": WORKSPACE,
            "format": "md",
        }
        self.complete = complete or {"accepted": True, "deleted": False}
        self.removal = removal or {
            "documentId": DOCUMENT,
            "workspaceId": WORKSPACE,
            "deleted": True,
        }

    def __call__(self, payload):
        self.calls.append(payload)

        return {
            "begin": self.begin,
            "complete": self.complete,
            "fail": {"accepted": True},
            "removal": self.removal,
            "reindex": self.reindex,
        }[payload["action"]]

    def actions(self):
        return [call["action"] for call in self.calls]


class FakeStore:
    def work(self, document_id):
        return nullcontext()

    def completed(self, *args):
        return None

    def __init__(self, outcome="written"):
        self.outcome = outcome
        self.events = []

    def write(
        self,
        document_id,
        workspace_id,
        version_id,
        sequencer,
        chunks,
        embedded,
        character_count,
        replace=False,
        completion=None,
        job_id=None,
    ):
        self.events.append(("write", document_id, len(chunks), replace))

        return self.outcome

    def clear(self, *args):
        self.events.append(("clear", args[0]))

    def purge(self, document_id, workspace_id):
        self.events.append(("purge", document_id, workspace_id))


class FakeObjects:
    def __init__(self, data=None, error=None):
        self.data = data if data is not None else (FIXTURES / "reference.md").read_bytes()
        self.error = error

    def read(self, bucket, key, version_id):
        if self.error:
            raise self.error

        return self.data


class FakeEmbeddings:
    model = "text-embedding-3-small"

    def __init__(self):
        self.inputs = []

    def embed(self, texts):
        self.inputs.append(texts)

        return Embedded([[0.0] * 1536 for _ in texts], tokens=11 * len(texts), model=self.model)


class FakeTrace:
    @contextmanager
    def document(self, *_args):
        yield None

    def embedding(self, *_args):
        return nullcontext(None)

    def record_usage(self, *_args):
        pass


def ports(control=None, store=None, objects=None):
    return Ports(
        control=RpcControl(control or FakeControl()),
        objects=objects or FakeObjects(),
        store=store or FakeStore(),
        embeddings=FakeEmbeddings(),
        trace=FakeTrace(),
        extractor=DocumentExtractor(),
        renditions=Mock(),
    )


def s3_record(event="ObjectCreated:Put", key=KEY, receive="1", version="v1", sequencer="00A1"):
    notification = {
        "Records": [
            {
                "eventName": event,
                "s3": {
                    "bucket": {"name": "papert-sources"},
                    "object": {
                        "key": key,
                        "size": 10,
                        "versionId": version,
                        "sequencer": sequencer,
                    },
                },
            }
        ]
    }

    return {
        "messageId": "m1",
        "body": json.dumps(notification),
        "attributes": {"ApproximateReceiveCount": receive},
    }


def test_test_events_and_rejected_objects_do_nothing():
    test_event = {"messageId": "t", "body": json.dumps({"Event": "s3:TestEvent"})}
    control = FakeControl(begin={"outcome": "reject", "reason": "unregistered"})
    store = FakeStore()

    process_record(ports(control, store), test_event)
    process_record(ports(control, store), s3_record(key="documents/forged/original.md"))

    assert control.actions() == ["begin"]
    assert store.events == []


def test_learner_file_failures_are_reported_and_consumed():
    control = FakeControl()
    store = FakeStore()
    pdf_as_markdown = FakeObjects((FIXTURES / "reference.pdf").read_bytes())

    result = process_batch(ports(control, store, pdf_as_markdown), {"Records": [s3_record()]})

    assert result == {"batchItemFailures": []}
    assert control.actions() == ["begin", "fail"]
    assert control.calls[1]["code"] == "content_mismatch"
    assert store.events == [("clear", DOCUMENT)]


def test_transient_failures_retry_and_report_on_the_last_delivery():
    first_control = FakeControl()
    last_control = FakeControl()
    unavailable = FakeObjects(error=ConnectionError("S3 unavailable"))

    first = process_batch(
        ports(first_control, objects=unavailable), {"Records": [s3_record(receive="1")]}
    )
    last = process_batch(
        ports(last_control, objects=unavailable), {"Records": [s3_record(receive="3")]}
    )

    assert first == {"batchItemFailures": [{"itemIdentifier": "m1"}]}
    assert first_control.actions() == ["begin"]
    assert last == {"batchItemFailures": [{"itemIdentifier": "m1"}]}
    assert last_control.actions() == ["begin", "fail"]
    assert last_control.calls[1]["code"] == "processing_failed"


def test_unknown_events_keep_the_existing_silent_ignore_behavior(capsys):
    control = FakeControl()
    store = FakeStore()

    process_record(ports(control, store), s3_record(event="ObjectRestore:Completed"))

    assert control.calls == []
    assert store.events == []
    assert capsys.readouterr().out == ""


def test_malformed_record_logs_only_safe_diagnostics_and_keeps_processing(capsys):
    malformed = {
        "messageId": "bad",
        "body": "private malformed text",
        "attributes": {"ApproximateReceiveCount": "2"},
    }
    valid = s3_record()

    response = process_batch(ports(), {"Records": [malformed, valid]})

    assert response == {"batchItemFailures": [{"itemIdentifier": "bad"}]}
    output = capsys.readouterr().out
    assert '"messageId": "bad"' in output
    assert '"error": "JSONDecodeError"' in output
    assert "private malformed text" not in output
    assert '"metric": "source_ingested"' in output
