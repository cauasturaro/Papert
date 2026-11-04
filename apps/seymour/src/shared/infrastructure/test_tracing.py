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
