"""Map semantic source-control calls to the existing Core RPC payloads."""

from src.application.control import (
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


def _document(answer: dict) -> Document:
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


def _completion(answer: dict) -> Completion:
    return Completion(answer.get("accepted", False), answer.get("deleted", False))


class RpcControl:
    def __init__(self, invoke):
        self.invoke = invoke

    def begin(self, request: Begin) -> Document:
        answer = self.invoke(
            {
                "action": "begin",
                "bucket": request.bucket,
                "key": request.key,
                "versionId": request.version_id,
                "sequencer": request.sequencer,
                "size": request.size,
            }
        )

        return _document(answer)

    def complete(self, request: Complete) -> Completion:
        answer = self.invoke(
            {
                "action": "complete",
                **_version(request),
                "chunkCount": request.chunk_count,
                "characterCount": request.character_count,
                "pageCount": request.page_count,
                "embeddingTokens": request.embedding_tokens,
                "warnings": request.warnings,
            }
        )

        return _completion(answer)

    def fail(self, request: Fail) -> Completion:
        answer = self.invoke({"action": "fail", **_version(request), "code": request.code})

        return _completion(answer)

    def removal(self, request: Removal) -> Removed:
        answer = self.invoke({"action": "removal", "bucket": request.bucket, "key": request.key})

        return Removed(
            answer.get("documentId"), answer.get("workspaceId"), answer.get("deleted", False)
        )

    def reindex(self, request: Reindex) -> Document:
        answer = self.invoke({"action": "reindex", "documentId": request.document_id})

        return _document(answer)
