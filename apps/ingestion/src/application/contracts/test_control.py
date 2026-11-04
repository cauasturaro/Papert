"""Pin the RPC payload bytes shared by Lambda Invoke and the local HTTP bridge."""

import json

import pytest

from src.application.contracts.control import (
    begin_request,
    complete_request,
    completion_answer,
    document_answer,
    fail_request,
    reindex_request,
    removal_request,
    removed_answer,
)
from src.domain.control import Begin, Complete, Completion, Fail, Reindex, Removal

pytestmark = pytest.mark.unit


def test_requests_preserve_rpc_field_names_order_and_omissions():
    document = "11111111-1111-4111-8111-111111111111"
    key = f"documents/{document}/original.md"

    payloads = [
        begin_request(Begin("papert-sources", key, "v1", "00A1", 10)),
        complete_request(Complete(document, "v1", "00A1", 2, 231, None, 22, [])),
        fail_request(Fail(document, "v1", "00A1", "content_mismatch")),
        removal_request(Removal("papert-sources", key)),
        reindex_request(Reindex(document)),
    ]

    expected = [
        {
            "action": "begin",
            "bucket": "papert-sources",
            "key": key,
            "versionId": "v1",
            "sequencer": "00A1",
            "size": 10,
        },
        {
            "action": "complete",
            "documentId": document,
            "versionId": "v1",
            "sequencer": "00A1",
            "chunkCount": 2,
            "characterCount": 231,
            "pageCount": None,
            "embeddingTokens": 22,
            "warnings": [],
        },
        {
            "action": "fail",
            "documentId": document,
            "versionId": "v1",
            "sequencer": "00A1",
            "code": "content_mismatch",
        },
        {"action": "removal", "bucket": "papert-sources", "key": key},
        {"action": "reindex", "documentId": document},
    ]

    assert [json.dumps(payload) for payload in payloads] == [
        json.dumps(payload) for payload in expected
    ]


def test_answers_default_omitted_fields():
    rejected = {"outcome": "reject", "reason": "unregistered"}
    accepted = {"accepted": True}

    document = document_answer(rejected)
    completion = completion_answer(accepted)
    removed = removed_answer(accepted)

    assert document.outcome == "reject"
    assert document.reason == "unregistered"
    assert document.document_id is None
    assert completion == Completion(accepted=True)
    assert removed.document_id is None
    assert removed.deleted is False
