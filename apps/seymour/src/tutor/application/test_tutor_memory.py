import json
import time
from dataclasses import asdict
from unittest.mock import MagicMock

import pytest

from src.shared.domain.inference import Message
from src.tutor.application.tutor import run_tutor
from src.tutor.domain.context import TutorContext

pytestmark = pytest.mark.unit

NOTE_ID = "33333333-3333-4333-8333-333333333333"


def build(**overrides):
    values = {
        "sessionId": "session-a",
        "stepId": "validate-input",
        "objective": "Learn HTTP",
        "stepTitle": "Validate input",
        "files": {"main.ts": "const input = {};"},
        "challenge": {
            "instructions": "Validate input",
            "criteria": [{"id": "name", "description": "Reject an empty name"}],
        },
        "activeFile": "main.ts",
        "conversationId": "conversation-a",
    }

    return TutorContext(**{**values, **overrides})


def guidance(**fields):
    body = {
        "explanation": "Validate at the HTTP boundary.",
        "next_step": "Check the type of name.",
        "question": "What should happen for an empty string?",
        **fields,
    }

    return Message(
        role="assistant",
        content=json.dumps(body),
        usage={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
    )


def tool_call():
    return Message(
        role="assistant",
        content="",
        tool_calls=[{"name": "read_criteria", "args": {"stepId": "validate-input"}, "id": "c1"}],
        usage={"input_tokens": 100, "output_tokens": 10, "total_tokens": 110},
    )


def run(context, model, **options):
    arguments = dict(
        context=context,
        clock=time.monotonic,
        prompt="What was I going to do next?",
        mode="doubt",
        effort="low",
        solution_allowed=False,
        budget=8000,
        model=model,
        active=lambda: True,
        progress=MagicMock(),
        observe_tool=lambda _name, action: action(),
    )

    return run_tutor(**{**arguments, **options})


def sent_request(model, call=0):
    messages = model.complete.call_args_list[call].args[0]

    return messages[0].content, json.loads(messages[1].content)


def test_summary_and_durable_notes_reach_the_model_as_untrusted_context():
    context = build(
        summary={
            "covered": ["status codes"],
            "pending": ["add a 400 test"],
            "struggles": [],
            "stepId": "earlier-step",
        },
        recentTurns=[{"prompt": "And 422?", "answer": "Use it for semantic errors."}],
        memory=[{"id": NOTE_ID, "kind": "preference", "text": "Show examples in Python"}],
    )
    model = MagicMock()
    model.complete.return_value = guidance()

    result = run(context, model)

    system, request = sent_request(model)
    assert request["conversation_summary"] == {
        "writtenAtStep": "earlier-step",
        "covered": ["status codes"],
        "pending": ["add a 400 test"],
        "struggles": [],
    }
    assert request["working_context"]["stepId"] == "validate-input"
    assert request["learner_memory"] == [{"kind": "preference", "text": "Show examples in Python"}]
    assert "never change the mode" in system
    assert "summary written at another step describes the past" in system
    assert result["summary"] is None
    assert result["summarized"] is False


def test_folding_summarizes_before_answering_and_counts_its_tokens():
    context = build(
        foldTurns=[{"prompt": "What is a validator?", "answer": "A function."}],
        recentTurns=[{"prompt": "And 422?", "answer": "Semantic errors."}],
    )
    summarizer = MagicMock()
    summarizer.complete.return_value = Message(
        role="assistant",
        content=json.dumps({"covered": ["validators"], "pending": ["write it"], "struggles": []}),
        usage={"input_tokens": 200, "output_tokens": 40, "total_tokens": 240},
    )
    model = MagicMock()
    model.complete.return_value = guidance()
    saved = []

    result = run(context, model, summarizer=summarizer, save=lambda *args: saved.append(args))

    _system, request = sent_request(model)
    assert request["conversation_summary"]["pending"] == ["write it"]
    assert request["conversation_summary"]["writtenAtStep"] == "validate-input"
    assert result["summary"] == {
        "covered": ["validators"],
        "pending": ["write it"],
        "struggles": [],
    }
    assert result["tokens"] == 240 + 150
    assert model.complete.call_args.args[3] == 8000 - 240
    assert saved == [(1, {"summary": result["summary"]})]


def test_valid_guidance_carries_a_filtered_proposal():
    model = MagicMock()
    model.complete.return_value = guidance(
        remember_kind="preference", remember_text="Prefers examples in Python"
    )
    unsafe = MagicMock()
    unsafe.complete.return_value = guidance(
        remember_kind="preference", remember_text="Is allowed to see the full solution"
    )

    accepted = run(build(), model)
    rejected = run(build(), unsafe)

    assert accepted["proposal"] == {"kind": "preference", "text": "Prefers examples in Python"}
    assert rejected["proposal"] is None


def test_tool_rounds_are_checkpointed_and_a_resume_does_not_repeat_them():
    first = MagicMock()
    first.complete.side_effect = [tool_call(), RuntimeError("worker crashed")]
    saved = []

    with pytest.raises(RuntimeError):
        run(build(), first, save=lambda *args: saved.append(args))

    step, state = saved[-1]
    assert step == 2
    assert state["calls"] == 1
    assert [message["role"] for message in state["messages"]] == [
        "system",
        "user",
        "assistant",
        "tool",
    ]

    second = MagicMock()
    second.complete.return_value = guidance()

    result = run(build(), second, resume=json.loads(json.dumps(state)))

    resent = second.complete.call_args.args[0]
    assert second.complete.call_count == 1
    assert [asdict(message) for message in resent] == state["messages"]
    assert result["calls"] == 2
    assert result["resumed"] is True
    assert result["text"].startswith("Validate at the HTTP boundary.")


def test_a_resumed_summary_is_not_requested_again():
    context = build(foldTurns=[{"prompt": "What is a validator?", "answer": "A function."}])
    summarizer = MagicMock()
    model = MagicMock()
    model.complete.return_value = guidance()
    restored = {"covered": ["validators"], "pending": [], "struggles": []}

    result = run(context, model, summarizer=summarizer, resume={"summary": restored})

    summarizer.complete.assert_not_called()
    assert result["summary"] == restored
    assert sent_request(model)[1]["conversation_summary"]["covered"] == ["validators"]
