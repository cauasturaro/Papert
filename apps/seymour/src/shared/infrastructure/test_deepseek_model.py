import json
import math
import time
from contextlib import contextmanager
from unittest.mock import MagicMock

import httpx
import pytest
import tiktoken

from src.shared.domain.inference import (
    BudgetExceeded,
    Message,
    ModelTask,
    ModelUnavailable,
    TutorCancelled,
)
from src.shared.domain.prompts import PromptFamily
from src.shared.infrastructure.deepseek_model import (
    ESTIMATE_MARGIN,
    ESTIMATE_OVERHEAD,
    SCHEMA_INSTRUCTION,
    DeepSeekModel,
)
from src.shared.infrastructure.generation import GenerationCall, GenerationUsage

pytestmark = pytest.mark.unit


@pytest.fixture
def task():
    return ModelTask(
        "test_answer", {"type": "object"}, PromptFamily("test.answer", {"system": "Return json"})
    )


@pytest.fixture
def harness(task):
    requests, calls, errors = [], [], []
    record = MagicMock()

    @contextmanager
    def observe(call):
        calls.append(call)
        try:
            yield record
        except Exception as error:
            errors.append(error)
            raise

    def create(handler=None, **options):
        def respond(request):
            requests.append(request)
            if handler is not None:
                return handler(request)

            return httpx.Response(200, json=payload())

        return DeepSeekModel(
            "test-key",
            "deepseek-flash",
            observe,
            options.pop("task", task),
            transport=httpx.MockTransport(respond),
            **options,
        )

    return create, requests, calls, record, errors


def payload(message=None, usage=None, finish_reason="stop"):
    return {
        "choices": [
            {
                "message": message
                if message is not None
                else {"role": "assistant", "content": "{}"},
                "finish_reason": finish_reason,
            }
        ],
        "usage": usage if usage is not None else {"prompt_tokens": 100, "completion_tokens": 10},
    }


def complete(model, **options):
    arguments = dict(
        messages=[],
        tools=[],
        effort="low",
        remaining=8000,
        deadline=time.monotonic() + 10,
        active=lambda: True,
    )

    return model.complete(**{**arguments, **options})


@pytest.mark.parametrize(
    "effort,reasoning,maximum",
    [("low", "low", 2048), ("medium", "high", 3072), ("high", "high", 4096)],
)
def test_request_shape_and_estimated_admission(harness, task, effort, reasoning, maximum):
    create, requests, calls, record, _ = harness
    model = create(base_url="https://provider.test/v1/")
    messages = [Message("system", "Policy"), Message("user", "Help <|endoftext|>")]
    tool = {"name": "read_code", "description": "Read code", "input_schema": {"type": "object"}}

    result = complete(model, messages=messages, tools=[tool], effort=effort)

    assert len(requests) == 1
    request = requests[0]
    body = json.loads(request.content)
    assert request.method == "POST"
    assert str(request.url) == "https://provider.test/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer test-key"
    assert body == {
        "model": "deepseek-flash",
        "messages": [
            {
                "role": "system",
                "content": SCHEMA_INSTRUCTION + json.dumps(task.schema, separators=(",", ":")),
            },
            {"role": "system", "content": "Policy"},
            {"role": "user", "content": "Help <|endoftext|>"},
        ],
        "max_tokens": maximum,
        "response_format": {"type": "json_object"},
        "reasoning_effort": reasoning,
        "stream": False,
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "read_code",
                    "description": "Read code",
                    "parameters": tool["input_schema"],
                },
            }
        ],
        "parallel_tool_calls": False,
    }
    assert "json" in SCHEMA_INSTRUCTION
    assert 0.1 <= request.extensions["timeout"]["read"] <= 10

    del body["max_tokens"]
    encoding = tiktoken.get_encoding("cl100k_base")
    estimate = (
        math.ceil(len(encoding.encode(json.dumps(body), disallowed_special=())) * ESTIMATE_MARGIN)
        + ESTIMATE_OVERHEAD
    )
    assert calls == [
        GenerationCall(
            "deepseek",
            "deepseek-flash",
            effort,
            estimate,
            False,
            maximum,
            task.prompt.id,
            task.prompt.version,
        )
    ]
    assert result.usage == {"input_tokens": 100, "output_tokens": 10, "total_tokens": 110}
    record.usage.assert_called_once_with(GenerationUsage(100, 10, 0))


def test_custom_output_limits_and_no_tools(harness, task):
    create, requests, _, _, _ = harness
    custom_task = ModelTask(task.name, task.schema, task.prompt, {"low": 25})
    model = create(task=custom_task)

    complete(model)

    body = json.loads(requests[0].content)
    assert body["max_tokens"] == 25
    assert "tools" not in body
    assert "parallel_tool_calls" not in body


@pytest.mark.parametrize(
    "options,error",
    [
        ({"remaining": 0, "active": lambda: False, "deadline": 0}, BudgetExceeded),
        ({"active": lambda: False, "deadline": 0}, TutorCancelled),
        ({"deadline": 0}, TimeoutError),
    ],
)
def test_preflight_rejects_before_request_or_observer(harness, options, error):
    create, requests, calls, _, _ = harness
    model = create()

    with pytest.raises(error):
        complete(model, **options)

    assert requests == []
    assert calls == []


@pytest.mark.parametrize(
    "status,header,reason,retry_after",
    [
        (429, "2.5", "rate_limited", 2.5),
        (429, "invalid", "rate_limited", None),
        (429, None, "rate_limited", None),
        (500, None, "server_error", None),
        (503, None, "server_error", None),
    ],
)
def test_http_failures_are_observed_without_retries(harness, status, header, reason, retry_after):
    create, requests, _, record, errors = harness
    headers = {"Retry-After": header} if header is not None else {}
    model = create(lambda _: httpx.Response(status, headers=headers))

    with pytest.raises(ModelUnavailable) as failure:
        complete(model)

    assert len(requests) == 1
    assert failure.value.reason == reason
    assert failure.value.retry_after == retry_after
    assert failure.value.charged == 0
    assert errors == [failure.value]
    record.usage.assert_not_called()


@pytest.mark.parametrize("error", [httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError])
def test_transport_failures_are_observed_and_timeout_is_charged(harness, error):
    create, requests, calls, _, errors = harness

    def fail(request):
        raise error("Failed", request=request)

    model = create(fail)

    with pytest.raises(ModelUnavailable) as failure:
        complete(model)

    timed_out = issubclass(error, httpx.TimeoutException)
    assert len(requests) == 1
    assert failure.value.reason == ("timeout" if timed_out else "server_error")
    assert failure.value.charged == (
        calls[0].input_tokens + calls[0].max_output if timed_out else 0
    )
    assert errors == [failure.value]


def test_rejected_request_never_exposes_response_body(harness):
    create, requests, _, _, errors = harness
    model = create(lambda _: httpx.Response(400, text="private learner input"))

    with pytest.raises(RuntimeError) as failure:
        complete(model)

    assert str(failure.value) == "Model request rejected with status 400"
    assert len(requests) == 1
    assert errors == [failure.value]


@pytest.mark.parametrize(
    "usage",
    [
        {},
        [],
        {"prompt_tokens": True, "completion_tokens": 1},
        {"prompt_tokens": 1.0, "completion_tokens": 1},
        {"prompt_tokens": -1, "completion_tokens": 1},
        {"prompt_tokens": 100, "completion_tokens": False},
        {"prompt_tokens": 100, "completion_tokens": -1},
        {"prompt_tokens": 100, "completion_tokens": 2049},
        {"prompt_tokens": 100, "completion_tokens": 1, "prompt_cache_hit_tokens": -1},
        {"prompt_tokens": 100, "completion_tokens": 1, "prompt_cache_hit_tokens": 101},
        {"prompt_tokens": 100, "completion_tokens": 1, "prompt_cache_hit_tokens": True},
        {"prompt_tokens": 100, "completion_tokens": 1, "total_tokens": 0},
        {"prompt_tokens": 100, "completion_tokens": 1, "total_tokens": 101.0},
        {"prompt_tokens": 8000, "completion_tokens": 1},
    ],
)
def test_invalid_usage_is_observed_without_retry(harness, usage):
    create, requests, _, record, errors = harness
    model = create(lambda _: httpx.Response(200, json=payload(usage=usage)))

    with pytest.raises(RuntimeError, match="usage") as failure:
        complete(model)

    assert len(requests) == 1
    assert errors == [failure.value]
    record.usage.assert_not_called()


def test_actual_input_can_exceed_estimate_and_cached_usage_is_recorded(harness):
    create, _, calls, record, _ = harness
    usage = {
        "prompt_tokens": 3000,
        "completion_tokens": 10,
        "prompt_cache_hit_tokens": 500,
        "total_tokens": 3010,
    }
    model = create(lambda _: httpx.Response(200, json=payload(usage=usage)))

    result = complete(model)

    assert calls[0].input_tokens < 3000
    assert result.usage["total_tokens"] == 3010
    record.usage.assert_called_once_with(GenerationUsage(3000, 10, 500))


def test_tool_round_trip_replays_raw_reasoning_and_prunes_history(harness):
    create, requests, _, _, _ = harness
    raw_message = {
        "role": "assistant",
        "content": None,
        "reasoning_content": "opaque reasoning",
        "tool_calls": [
            {
                "id": "call_1",
                "type": "function",
                "function": {"name": "read_code", "arguments": '{ "path": "main.py" }'},
            }
        ],
    }
    model = create(lambda _: httpx.Response(200, json=payload(message=raw_message)))
    user = Message("user", "Read code")

    first = complete(model, messages=[user])
    tool_result = Message("tool", "print('hello')", tool_call_id="call_1")
    second = complete(model, messages=[user, first, tool_result])

    assert first.content == ""
    assert first.tool_calls == [{"id": "call_1", "name": "read_code", "args": {"path": "main.py"}}]
    continuation = json.loads(requests[1].content)["messages"]
    assert continuation[2] == raw_message
    assert continuation[3] == {
        "role": "tool",
        "tool_call_id": "call_1",
        "content": "print('hello')",
    }
    assert len(requests) == 2
    assert model._history[id(first)] == (first, raw_message)

    complete(model, messages=[user, second])

    assert id(first) not in model._history
    assert id(second) in model._history
    assert len(requests) == 3


def test_external_assistant_messages_are_serialized(harness):
    create, requests, _, _, _ = harness
    model = create()
    assistant = Message(
        "assistant",
        "Reading",
        tool_calls=[{"id": "call_2", "name": "read_code", "args": {"path": "main.py"}}],
    )

    complete(model, messages=[Message("assistant", "Earlier"), assistant])

    messages = json.loads(requests[0].content)["messages"]
    assert messages[1] == {"role": "assistant", "content": "Earlier"}
    assert messages[2] == {
        "role": "assistant",
        "content": "Reading",
        "tool_calls": [
            {
                "id": "call_2",
                "type": "function",
                "function": {"name": "read_code", "arguments": json.dumps({"path": "main.py"})},
            }
        ],
    }


@pytest.mark.parametrize(
    "message,finish_reason",
    [
        ({"content": " \n\t"}, "stop"),
        ({"content": None}, "stop"),
        ({"content": None, "tool_calls": None}, "stop"),
        ({"content": '{"partial":'}, "length"),
        (
            {
                "content": "partial",
                "tool_calls": [{"id": "c", "function": {"name": "read", "arguments": "{}"}}],
            },
            "length",
        ),
        (
            {
                "content": "Answer",
                "tool_calls": [{"id": "c", "function": {"name": "read", "arguments": "{"}}],
            },
            "tool_calls",
        ),
    ],
)
def test_unusable_outputs_are_empty(harness, message, finish_reason):
    create, requests, _, record, _ = harness
    model = create(
        lambda _: httpx.Response(200, json=payload(message=message, finish_reason=finish_reason))
    )

    result = complete(model)

    assert result.content == ""
    assert result.tool_calls == []
    assert result.usage["total_tokens"] == 110
    assert len(requests) == 1
    record.usage.assert_called_once()


@pytest.mark.parametrize("key", ["", " \n\t"])
def test_blank_api_key_is_rejected(task, key):
    with pytest.raises(ValueError, match="DEEPSEEK_API_KEY is required"):
        DeepSeekModel(key, "deepseek-flash", MagicMock(), task)
