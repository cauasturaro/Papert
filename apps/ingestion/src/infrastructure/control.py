"""Source-control adapter over an injected Core RPC transport."""

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
from src.domain.control import (
    Begin,
    Complete,
    Completion,
    Document,
    Fail,
    ProcessableDocument,
    Reindex,
    Removal,
    Removed,
)


class RpcControl:
    def __init__(self, invoke):
        self.invoke = invoke

    def begin(self, request: Begin) -> Document | ProcessableDocument:
        answer = self.invoke(begin_request(request))

        return document_answer(answer)

    def complete(self, request: Complete) -> Completion:
        answer = self.invoke(complete_request(request))

        return completion_answer(answer)

    def fail(self, request: Fail) -> Completion:
        answer = self.invoke(fail_request(request))

        return completion_answer(answer)

    def removal(self, request: Removal) -> Removed:
        answer = self.invoke(removal_request(request))

        return removed_answer(answer)

    def reindex(self, request: Reindex) -> Document | ProcessableDocument:
        answer = self.invoke(reindex_request(request))

        return document_answer(answer)
