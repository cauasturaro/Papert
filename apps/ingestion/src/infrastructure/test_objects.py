import json
from unittest.mock import Mock

import pytest

from src.infrastructure.objects import S3Renditions

pytestmark = pytest.mark.unit


def test_s3_rendition_writer_serializes_unicode_as_utf8_json():
    client = Mock()
    writer = S3Renditions(client)
    body = {"blocks": [{"text": "Ação e coração", "location": {"paragraphStart": 1}}]}
    expected_bytes = json.dumps(body, ensure_ascii=False).encode("utf-8")

    writer.write("sources", "renditions/document/version.json", body)

    client.put_object.assert_called_once_with(
        Bucket="sources",
        Key="renditions/document/version.json",
        Body=expected_bytes,
        ContentType="application/json",
    )
    assert "Ação e coração".encode() in expected_bytes


def test_s3_rendition_writer_propagates_s3_failures():
    client = Mock()
    client.put_object.side_effect = ConnectionError("S3 unavailable")
    writer = S3Renditions(client)

    with pytest.raises(ConnectionError, match="S3 unavailable"):
        writer.write("sources", "renditions/document/version.json", {})

    client.put_object.assert_called_once()
