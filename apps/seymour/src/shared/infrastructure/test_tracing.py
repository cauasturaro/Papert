from unittest.mock import MagicMock

import pytest

from src.shared.infrastructure.tracing import mask

pytestmark = pytest.mark.unit


def test_mask_removes_prompts_code_credentials_and_exception_strings():
    raw = {
        "prompt": "password=private",
        "code": "student code",
        "error": "bearer secret",
        "tokens": 17,
    }

    masked = mask(raw)

    assert masked == {
        "prompt": "[redacted]",
        "code": "[redacted]",
        "error": "[redacted]",
        "tokens": 17,
    }


@pytest.mark.parametrize("name", ["seymour-tutor", "seymour-evaluation"])
def test_execution_adapter_suppresses_langsmith_and_hides_sdk_spans(monkeypatch, name):
    from langsmith import tracing_context
    from langsmith.run_helpers import get_tracing_context

    from src.shared.infrastructure.tracing import ExecutionTrace

    client = MagicMock()
    sdk_span = client.start_as_current_observation.return_value.__enter__.return_value
    monkeypatch.setenv("LANGFUSE_BASE_URL", "http://localhost")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "test-public")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "test-secret")
    monkeypatch.setattr("src.shared.infrastructure.tracing.Langfuse", lambda **_: client)
    trace = ExecutionTrace()
    measurements = {"calls": 1, "tokens": 150}

    with tracing_context(enabled=True), trace.execution("execution", "session", name) as scope:
        enabled = get_tracing_context()["enabled"]

        scope.record_metadata(measurements)

    assert enabled is False
    assert scope is not sdk_span
    sdk_span.update.assert_called_once_with(metadata=measurements)
    client.flush.assert_called_once()


@pytest.mark.parametrize(
    "name, expected", [("read_code", "read_code"), ("private prompt", "unknown-tool")]
)
def test_tool_names_are_limited_to_the_composed_allowlist(monkeypatch, name, expected):
    from src.shared.infrastructure.tracing import ExecutionTrace

    client = MagicMock()
    monkeypatch.setenv("LANGFUSE_BASE_URL", "http://localhost")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "test-public")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "test-secret")
    monkeypatch.setattr("src.shared.infrastructure.tracing.Langfuse", lambda **_: client)
    trace = ExecutionTrace(["read_code"])
    tool_result = MagicMock(kind="code")

    result = trace.tool(name, lambda: tool_result)

    assert result is tool_result
    client.start_as_current_observation.assert_called_once_with(name=expected, as_type="tool")


def test_prompt_versions_and_fallback_values_survive_the_mask():
    metadata = {
        "prompt": "tutor.guidance",
        "prompt_version": "sha:0123456789ab",
        "provider": "deepseek",
        "reason": "rate_limited",
        "action": "switch",
        "error": "ModelUnavailable",
        "note": "sha:learner text",
    }

    masked = mask(metadata)

    assert masked == {**metadata, "note": "[redacted]"}


def test_cost_separates_cached_input_from_uncached_input():
    from src.shared.infrastructure.generation import GenerationUsage, cost_details

    cost = cost_details("gpt-5.4-nano-2026-03-17", GenerationUsage(input=100, output=10, cached=20))
    unknown = cost_details("unpriced-model", GenerationUsage(input=1, output=1, cached=0))

    assert cost["input"] == pytest.approx(0.0000164)
    assert cost["output"] == pytest.approx(0.0000125)
    assert unknown is None


def test_a_failed_execution_marks_the_trace_and_keeps_the_original_error(monkeypatch):
    from src.shared.infrastructure.tracing import ExecutionTrace

    client = MagicMock()
    span = client.start_as_current_observation.return_value.__enter__.return_value
    monkeypatch.setenv("LANGFUSE_BASE_URL", "http://localhost")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "test-public")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "test-secret")
    monkeypatch.setattr("src.shared.infrastructure.tracing.Langfuse", lambda **_: client)
    trace = ExecutionTrace()
    original = KeyError("excerpts")

    with pytest.raises(KeyError) as failure, trace.execution("execution", "session"):
        raise original

    assert failure.value is original
    span.update.assert_called_once_with(level="ERROR", metadata={"error": "KeyError"})
    client.flush.assert_called_once()
