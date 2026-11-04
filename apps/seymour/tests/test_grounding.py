"""Citations, live source authorization and trace-safe retrieval measurements."""

import json
from unittest.mock import MagicMock

from src.executions.application.ports import ExecutionResources
from src.executions.application.workflows import grounding_measurements, run_tutor_job
from src.executions.domain.execution import Result
from src.executions.infrastructure.contracts import encode_result
from src.shared.inference import Message
from src.tutor.infrastructure.tracing import mask, retrieval_metadata

KEPT = "11111111-1111-4111-8111-111111111111"
DELETED = "22222222-2222-4222-8222-222222222222"
WORKSPACE = "44444444-4444-4444-8444-444444444444"
USAGE = {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150}


def tutor_request(prompt="What does the guide say about orders?"):
    return {
        "sessionId": "session-a",
        "stepId": "validate-input",
        "objective": "Build an HTTP service",
        "stepTitle": "Validate input",
        "files": {"main.ts": "const input = {};"},
        "challenge": {
            "instructions": "Validate input",
            "criteria": [{"id": "name", "description": "Reject an empty name"}],
        },
        "workspaceId": WORKSPACE,
        "sources": [
            {"id": KEPT, "filename": "guide.pdf", "format": "pdf"},
            {"id": DELETED, "filename": "old.md", "format": "md"},
        ],
        "sourceIds": [],
        "prompt": prompt,
        "mode": "doubt",
        "solutionAllowed": False,
    }


def answer(sources):
    return Message(
        role="assistant",
        content=json.dumps(
            {
                "explanation": "Orders are JSON.",
                "quote_from": "",
                "quote_to": "",
                "next_step": "Send one.",
                "question": "Which field is required?",
                "sources": sources,
            }
        ),
        usage=USAGE,
    )


class RecordingSearch:
    def __init__(self, passages):
        self.passages = passages
        self.calls = []

    def __call__(self, query, document_ids):
        self.calls.append(document_ids)

        return self.passages, 5


def run_job(live, passages, sources, noop_trace):
    model = MagicMock()
    model.complete.return_value = answer(sources)
    search = RecordingSearch(passages)
    runtime = ExecutionResources(model, noop_trace, lambda: 100.0, search)

    control = MagicMock()
    control.active.return_value = True
    control.live_sources.return_value = live
    published = []

    run_tutor_job(
        "execution", "lease", tutor_request(), 8000, control, published.append, lambda _: runtime
    )

    return published[-1], search


def test_deleted_sources_are_not_searched_and_answers_report_their_citations(noop_trace):
    passages = [
        {
            "documentId": KEPT,
            "ordinal": 0,
            "start": 0,
            "content": "POST /orders accepts JSON.",
            "location": {"page": 2},
            "distance": 0.2,
        }
    ]

    result, search = run_job([KEPT], passages, ["guide.pdf, p. 2"], noop_trace)

    assert search.calls == [[KEPT]]
    assert result.grounding == {
        "support": "cited",
        "citations": [
            {
                "sourceId": KEPT,
                "cite": "guide.pdf, p. 2",
                "location": {"page": 2},
                "excerpt": "POST /orders accepts JSON.",
                "quote": None,
            }
        ],
    }


def test_answers_without_usable_sources_are_marked_unsupported(noop_trace):
    result, search = run_job([], [], ["guide.pdf, p. 2"], noop_trace)

    assert search.calls == []
    assert result.grounding == {"support": "unsupported", "citations": []}


def test_grounding_travels_in_the_result_event():
    grounding = {"support": "unsupported", "citations": []}
    result = Result("execution", "lease", 100, "completed", "text", 10, grounding=grounding)

    event = encode_result(result)

    assert event["grounding"] == grounding
    assert "grounding" not in encode_result(Result("execution", "lease", 1, "running", "", 0))


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
