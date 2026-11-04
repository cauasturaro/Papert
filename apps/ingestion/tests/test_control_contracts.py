"""Pin the RPC payload bytes shared by Lambda Invoke and the local HTTP bridge."""

import json

from src.application.control import Begin, Complete, Completion, Fail, Reindex, Removal
from src.infrastructure.control import RpcControl


def test_semantic_methods_preserve_rpc_field_names_order_and_omissions():
    calls = []

    def invoke(payload):
        calls.append(json.dumps(payload))
        if payload["action"] in {"begin", "reindex"}:
            return {"outcome": "reject", "reason": "unregistered"}

        return {"accepted": True}

    control = RpcControl(invoke)
    document = "11111111-1111-4111-8111-111111111111"
    key = f"documents/{document}/original.md"

    begun = control.begin(Begin("papert-sources", key, "v1", "00A1", 10))
    completed = control.complete(Complete(document, "v1", "00A1", 2, 231, None, 22, []))
    failed = control.fail(Fail(document, "v1", "00A1", "content_mismatch"))
    removed = control.removal(Removal("papert-sources", key))
    reindexed = control.reindex(Reindex(document))

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

    assert calls == [json.dumps(payload) for payload in expected]
    assert begun.outcome == reindexed.outcome == "reject"
    assert begun.reason == "unregistered"
    assert completed == failed == Completion(accepted=True)
    assert removed.document_id is None
