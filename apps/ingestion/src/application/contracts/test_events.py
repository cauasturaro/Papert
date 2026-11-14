import json

import pytest

from src.application.contracts.events import IngestionEvent, ReindexEvent, decode_record

pytestmark = pytest.mark.unit

DOCUMENT = "11111111-1111-4111-8111-111111111111"


@pytest.mark.parametrize(
    ("event_name", "kind"),
    [
        ("ObjectCreated:CompleteMultipartUpload", "created"),
        ("ObjectRemoved:DeleteMarkerCreated", "removed"),
        ("ObjectRestore:Completed", "ignored"),
    ],
)
def test_transport_maps_event_names_and_preserves_object_identity(event_name, kind):
    s3_object = {
        "key": "folder%2Fsource+notes.md",
        "size": 10,
        "versionId": "v1",
        "sequencer": "00A1",
    }
    notification = {
        "Records": [
            {
                "eventName": event_name,
                "s3": {"bucket": {"name": "papert-sources"}, "object": s3_object},
            }
        ]
    }
    record = {
        "messageId": "m1",
        "body": json.dumps(notification),
        "attributes": {"ApproximateReceiveCount": "1"},
    }

    decoded = decode_record(record)

    assert len(decoded.notifications) == 1
    notification = decoded.notifications[0]
    assert notification.kind == kind
    assert notification.bucket == "papert-sources"
    assert notification.key == "folder/source notes.md"
    assert notification.version_id == "v1"
    assert notification.sequencer == "00A1"
    assert notification.size == 10


def test_test_events_and_reindex_requests_decode_without_notifications():
    test_event = {"messageId": "t", "body": json.dumps({"Event": "s3:TestEvent"})}
    reindex = {
        "messageId": "r",
        "body": json.dumps({"PapertReindex": {"documentId": DOCUMENT}}),
        "attributes": {"ApproximateReceiveCount": "2"},
    }

    decoded_test = decode_record(test_event)
    decoded_reindex = decode_record(reindex)

    assert decoded_test == IngestionEvent(1, ())
    assert decoded_reindex == ReindexEvent(2, DOCUMENT, "r")
