"""Core source-control RPC payloads shared by Lambda Invoke and the local HTTP bridge."""

from src.domain.control import (
    Begin,
    Complete,
    Completion,
    Document,
    Fail,
    Reindex,
    Removal,
    Removed,
    Version,
)


def _version(request: Version) -> dict:
    return {
        "documentId": request.document_id,
        "versionId": request.version_id,
        "sequencer": request.sequencer,
    }


def begin_request(request: Begin) -> dict:
    return {
        "action": "begin",
        "bucket": request.bucket,
        "key": request.key,
        "versionId": request.version_id,
        "sequencer": request.sequencer,
        "size": request.size,
    }


def complete_request(request: Complete) -> dict:
    return {
        "action": "complete",
        **_version(request),
        "chunkCount": request.chunk_count,
        "characterCount": request.character_count,
        "pageCount": request.page_count,
        "embeddingTokens": request.embedding_tokens,
        "warnings": request.warnings,
    }


def fail_request(request: Fail) -> dict:
    return {"action": "fail", **_version(request), "code": request.code}


def removal_request(request: Removal) -> dict:
    return {"action": "removal", "bucket": request.bucket, "key": request.key}


def reindex_request(request: Reindex) -> dict:
    return {"action": "reindex", "documentId": request.document_id}


def document_answer(answer: dict) -> Document:
    return Document(
        outcome=answer["outcome"],
        document_id=answer.get("documentId"),
        workspace_id=answer.get("workspaceId"),
        format=answer.get("format"),
        reason=answer.get("reason"),
        bucket=answer.get("bucket"),
        key=answer.get("key"),
        version_id=answer.get("versionId"),
        sequencer=answer.get("sequencer"),
    )


def completion_answer(answer: dict) -> Completion:
    return Completion(answer.get("accepted", False), answer.get("deleted", False))


def removed_answer(answer: dict) -> Removed:
    return Removed(
        answer.get("documentId"), answer.get("workspaceId"), answer.get("deleted", False)
    )
