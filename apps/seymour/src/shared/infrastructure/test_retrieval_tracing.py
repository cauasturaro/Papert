import json

import pytest

from src.executions.application.workflows import grounding_measurements
from src.shared.infrastructure.tracing import mask, retrieval_metadata

pytestmark = pytest.mark.unit

KEPT = "11111111-1111-4111-8111-111111111111"


def test_traces_keep_ids_and_numbers_but_never_source_text():
    passages = [
        {
            "documentId": KEPT,
            "ordinal": 3,
            "start": 0,
            "content": "secret source text",
            "location": {"paragraphStart": 4, "paragraphEnd": 5, "heading": "Private notes"},
            "distance": 0.31,
        }
    ]
    citations = [
        {
            "sourceId": KEPT,
            "cite": "diary.docx, Private notes (¶ 4-5)",
            "location": {"paragraphStart": 4, "paragraphEnd": 5, "heading": "Private notes"},
            "excerpt": "secret source text",
            "quote": None,
        }
    ]

    metadata = mask(retrieval_metadata(passages, 9))
    measurements = mask(grounding_measurements({"support": "cited", "citations": citations}))

    assert metadata == {
        "embeddingTokens": 9,
        "passages": [
            {
                "documentId": KEPT,
                "ordinal": 3,
                "distance": 0.31,
                "characters": 18,
                "location": {"paragraphStart": 4, "paragraphEnd": 5},
            }
        ],
    }
    assert measurements["sourceSupport"] == "cited"
    assert measurements["citations"][0]["sourceId"] == KEPT
    assert measurements["citations"][0]["location"]["heading"] == "[redacted]"
    assert "secret" not in json.dumps([metadata, measurements])
