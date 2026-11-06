import json
import time
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest
from langchain_core.messages import AIMessage

from src.shared.domain.inference import Message, ModelUnavailable
from src.shared.infrastructure.generation import GenerationUsage
from src.shared.infrastructure.openai_model import OpenAIModel, from_langchain
from src.tutor.application.guidance import guidance_task
from src.tutor.application.tools import tool_definitions
from src.tutor.application.tutor import BudgetExceeded, TutorCancelled, run_tutor
from src.tutor.domain.context import TutorContext

pytestmark = pytest.mark.unit


@pytest.fixture
def context():
    return TutorContext(
        sessionId="session-a",
        stepId="validate-input",
        objective="Learn HTTP",
        stepTitle="Validate input",
        files={"main.ts": "const input = {};"},
        challenge={
            "instructions": "Validate input",
            "criteria": [{"id": "name", "description": "Reject an empty name"}],
        },
        activeFile="main.ts",
    )


def response(content=None, calls=None):
    return Message(
        role="assistant",
        content=content
        or json.dumps(
            {
                "explanation": "Validate at the HTTP boundary.",
                "next_step": "Check the type of name.",
                "question": "What should happen for an empty string?",
            }
        ),
        tool_calls=calls or [],
        usage={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
    )


def run(context, model, **options):
    arguments = dict(
        context=context,
        clock=time.monotonic,
        prompt="Help me understand input validation.",
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


@pytest.mark.parametrize("earlier_phase", ["commentary", "final_answer"])
def test_guidance_uses_last_final_message_without_concatenating_other_messages(
    context, earlier_phase
):
    model = MagicMock()
    message = response()
    final_text = message.content
    provider_message = AIMessage(
        content=[
            {
                "type": "text",
                "id": "msg_1",
                "phase": earlier_phase,
                "text": '{"status":"approved"}',
            },
            {"type": "text", "id": "msg_2", "phase": "final_answer", "text": final_text[:20]},
            {"type": "text", "id": "msg_2", "phase": "final_answer", "text": final_text[20:]},
        ],
        usage_metadata=message.usage,
    )
    model.complete.return_value = from_langchain(provider_message)

    result = run(context, model)

    assert "Validate at the HTTP boundary." in result["text"]
    assert "Next step:" in result["text"]
    assert "approved" not in result["text"]


@contextmanager
def generation(*_args):
    yield MagicMock()


def mock_openai_transport(monkeypatch, handler):
    def create_client(**kwargs):
        return httpx.Client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr("src.shared.infrastructure.openai_model.Client", create_client)


@pytest.mark.parametrize(
    "effort, maximum_output", [("low", 2048), ("medium", 3072), ("high", 4096)]
)
def test_openai_preflight_admits_input_and_output_before_generation(
    monkeypatch, effort, maximum_output
):
    requests = []

    def handler(request):
        payload = json.loads(request.content)
        requests.append(payload)
        if request.url.path.endswith("input_tokens"):
            return httpx.Response(200, json={"input_tokens": 4})

        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [],
                "usage": {"input_tokens": 4, "output_tokens": 2},
            },
        )

    mock_openai_transport(monkeypatch, handler)
    model = OpenAIModel("test-key", "gpt-5-nano-2025-08-07", generation, guidance_task())

    messages = [
        Message(role="system", content="Tutor policy"),
        Message(role="user", content="Help"),
    ]

    result = model.complete(
        messages, tool_definitions(), effort, 8000, time.monotonic() + 10, lambda: True
    )

    assert len(requests) == 2
    assert "max_output_tokens" not in requests[0]
    assert requests[1]["reasoning"] == {"effort": effort}
    assert requests[1]["truncation"] == "disabled"
    assert requests[1]["max_output_tokens"] == maximum_output
    assert requests[1]["store"] is False
    assert requests[1]["include"] == ["reasoning.encrypted_content"]
    assert requests[1]["parallel_tool_calls"] is False
    counted_fields = {
        key: value
        for key, value in requests[1].items()
        if key not in {"max_output_tokens", "store", "include", "stream"}
    }
    assert requests[0] == counted_fields
    assert {tool["name"] for tool in counted_fields["tools"]} == {
        tool["name"] for tool in tool_definitions()
    }
    assert result.usage["total_tokens"] == 6


def test_langchain_preserves_encrypted_reasoning_and_tool_results(context, monkeypatch):
    requests = []
    reasoning = {"type": "reasoning", "id": "rs_1", "summary": [], "encrypted_content": "opaque"}
    call = {
        "type": "function_call",
        "id": "fc_1",
        "call_id": "call_1",
        "name": "read_code",
        "arguments": json.dumps({"stepId": context.stepId, "path": "main.ts"}),
        "status": "completed",
    }

    def handler(request):
        payload = json.loads(request.content)
        requests.append((request.url.path, payload))
        if request.url.path.endswith("input_tokens"):
            return httpx.Response(200, json={"input_tokens": 100})

        output = [reasoning, call]
        if len(requests) == 4:
            output = [
                {
                    "type": "message",
                    "id": "msg_1",
                    "role": "assistant",
                    "status": "completed",
                    "content": [
                        {"type": "output_text", "text": response().content, "annotations": []}
                    ],
                }
            ]

        return httpx.Response(
            200,
            json={
                "id": "resp_1",
                "status": "completed",
                "output": output,
                "usage": {"input_tokens": 100, "output_tokens": 50},
            },
        )

    mock_openai_transport(monkeypatch, handler)
    model = OpenAIModel("test-key", "gpt-5.4-nano-2026-03-17", generation, guidance_task())

    result = run(context, model, effort="medium")

    assert result["calls"] == 2
    assert result["tokens"] == 300
    assert "Next step:" in result["text"]
    continuation = requests[3][1]
    assert reasoning in continuation["input"]
    assert any(
        item.get("type") == "function_call" and item["call_id"] == "call_1"
        for item in continuation["input"]
    )
    tool_result = next(
        item for item in continuation["input"] if item.get("type") == "function_call_output"
    )
    assert tool_result["call_id"] == "call_1"
    assert "const input" in tool_result["output"]
    assert "previous_response_id" not in continuation
    assert requests[2][1]["input"] == continuation["input"]


@pytest.mark.parametrize("status, reason", [(429, "rate_limited"), (500, "server_error")])
def test_langchain_does_not_retry_failed_generation(monkeypatch, status, reason):
    requests = []

    def handler(request):
        requests.append(request.url.path)
        if request.url.path.endswith("input_tokens"):
            return httpx.Response(200, json={"input_tokens": 100})

        return httpx.Response(status, json={"error": {"message": "Unavailable"}})

    mock_openai_transport(monkeypatch, handler)
    model = OpenAIModel("test-key", "gpt-5.4-nano-2026-03-17", generation, guidance_task())

    with pytest.raises(ModelUnavailable) as failure:
        model.complete([], [], "low", 8000, time.monotonic() + 10, lambda: True)

    assert failure.value.reason == reason
    assert failure.value.charged == 0
    assert requests == ["/v1/responses/input_tokens", "/v1/responses"]


def test_openai_does_not_generate_when_input_plus_output_exceeds_budget(monkeypatch):
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))

        return httpx.Response(200, json={"input_tokens": 8000})

    mock_openai_transport(monkeypatch, handler)
    model = OpenAIModel("test-key", "gpt-5-nano-2025-08-07", generation, guidance_task())

    with pytest.raises(BudgetExceeded):
        model.complete([], [], "low", 8000, time.monotonic() + 10, lambda: True)

    assert len(requests) == 1


def test_openai_rechecks_cancellation_after_counting_input(monkeypatch):
    requests = []

    def handler(request):
        requests.append(request.url.path)

        return httpx.Response(200, json={"input_tokens": 100})

    mock_openai_transport(monkeypatch, handler)
    model = OpenAIModel("test-key", "gpt-5.4-nano-2026-03-17", generation, guidance_task())

    with pytest.raises(TutorCancelled):
        model.complete([], [], "low", 8000, time.monotonic() + 10, lambda: False)

    assert requests == ["/v1/responses/input_tokens"]


@pytest.mark.parametrize(
    "usage",
    [
        {},
        {"input_tokens": 101, "output_tokens": 1},
        {"input_tokens": 100, "output_tokens": 2049},
        {"input_tokens": -1, "output_tokens": 1},
        {"input_tokens": 100, "output_tokens": 1, "total_tokens": 0},
        {"input_tokens": 100, "output_tokens": 1, "input_tokens_details": {"cached_tokens": 101}},
    ],
)
def test_openai_rejects_inconsistent_usage_without_retrying_generation(monkeypatch, usage):
    requests = []

    def handler(request):
        requests.append(request.url.path)
        payload = (
            {"input_tokens": 100}
            if request.url.path.endswith("input_tokens")
            else {"status": "completed", "output": [], "usage": usage}
        )

        return httpx.Response(200, json=payload)

    mock_openai_transport(monkeypatch, handler)
    model = OpenAIModel("test-key", "gpt-5.4-nano-2026-03-17", generation, guidance_task())

    with pytest.raises(RuntimeError, match="usage"):
        model.complete([], [], "low", 8000, time.monotonic() + 10, lambda: True)

    assert requests == ["/v1/responses/input_tokens", "/v1/responses"]


def test_openai_reports_cached_input_separately(monkeypatch):
    span = MagicMock()

    @contextmanager
    def observe(*_args):
        yield span

    def handler(request):
        if request.url.path.endswith("input_tokens"):
            return httpx.Response(200, json={"input_tokens": 100})

        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [],
                "usage": {
                    "input_tokens": 100,
                    "output_tokens": 10,
                    "input_tokens_details": {"cached_tokens": 20},
                },
            },
        )

    mock_openai_transport(monkeypatch, handler)
    model = OpenAIModel("test-key", "gpt-5.4-nano-2026-03-17", observe, guidance_task())

    result = model.complete([], [], "low", 8000, time.monotonic() + 10, lambda: True)

    assert result.usage["total_tokens"] == 110
    span.usage.assert_called_once_with(GenerationUsage(input=100, output=10, cached=20))


def test_openai_schema_preserves_the_previous_strict_guidance_schema(monkeypatch):
    fixture = Path(__file__).parents[3] / "tests/fixtures/guidance_schema.json"
    expected = json.loads(fixture.read_text())
    emitted = []
    model = OpenAIModel("test-key", "gpt-5-nano", lambda *_: None, guidance_task())

    def capture(**kwargs):
        emitted.append(kwargs["model_kwargs"]["text"]["format"]["schema"])
        raise RuntimeError("schema captured before any request")

    monkeypatch.setattr("src.shared.infrastructure.openai_model.ChatOpenAI", capture)

    with pytest.raises(RuntimeError, match="schema captured"):
        model.complete([], [], "low", 8000, time.monotonic() + 10, lambda: True)

    assert emitted == [expected]


def test_openai_schema_preserves_evaluation_overrides():
    from src.evaluation.application.evaluator import evaluation_task
    from src.evaluation.domain.evaluation import ModelEvaluation

    schema = ModelEvaluation.model_json_schema()
    model = OpenAIModel("test-key", "gpt-5-nano", lambda *_: None, evaluation_task())

    assert model.response_schema == schema
    assert model.response_name == "attempt_evaluation"


def test_openai_generation_timeout_charges_the_admitted_reservation(monkeypatch):
    def handler(request):
        if request.url.path.endswith("input_tokens"):
            return httpx.Response(200, json={"input_tokens": 100})

        raise httpx.ReadTimeout("slow", request=request)

    mock_openai_transport(monkeypatch, handler)
    model = OpenAIModel("test-key", "gpt-5.4-nano-2026-03-17", generation, guidance_task())

    with pytest.raises(ModelUnavailable) as failure:
        model.complete([], [], "low", 8000, time.monotonic() + 10, lambda: True)

    assert failure.value.reason == "timeout"
    assert failure.value.charged == 100 + 2048


def test_openai_count_failures_are_unavailable_and_free(monkeypatch):
    def handler(request):
        return httpx.Response(503, json={"error": {"message": "Overloaded"}})

    mock_openai_transport(monkeypatch, handler)
    model = OpenAIModel("test-key", "gpt-5.4-nano-2026-03-17", generation, guidance_task())

    with pytest.raises(ModelUnavailable) as failure:
        model.complete([], [], "low", 8000, time.monotonic() + 10, lambda: True)

    assert failure.value.reason == "server_error"
    assert failure.value.charged == 0


def test_openai_records_the_prompt_family_and_cache_key(monkeypatch):
    calls = []
    requests = []

    @contextmanager
    def observe(call):
        calls.append(call)
        yield MagicMock()

    def handler(request):
        requests.append(json.loads(request.content))
        if request.url.path.endswith("input_tokens"):
            return httpx.Response(200, json={"input_tokens": 10})

        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [],
                "usage": {"input_tokens": 10, "output_tokens": 1},
            },
        )

    mock_openai_transport(monkeypatch, handler)
    task = guidance_task()
    model = OpenAIModel("test-key", "gpt-5.4-nano-2026-03-17", observe, task, cache_key="tutor")

    model.complete([], [], "low", 8000, time.monotonic() + 10, lambda: True)

    assert calls[0].prompt == "tutor.guidance"
    assert calls[0].prompt_version == task.prompt.version
    assert calls[0].input_exact is True
    assert "prompt_cache_key" not in requests[0]
    assert requests[1]["prompt_cache_key"] == "tutor"
