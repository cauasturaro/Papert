from collections.abc import Mapping

from src.shared.domain.inference import ModelUnavailable
from src.shared.infrastructure.generation import GenerationUsage

MISSING = object()


def status_failure(status: int, headers: Mapping[str, str]) -> Exception:
    """429 and 5xx mean the provider is unavailable; other statuses are request errors."""
    if status == 429:
        return ModelUnavailable("rate_limited", retry_after=_retry_after(headers))
    if status >= 500:
        return ModelUnavailable("server_error")

    return RuntimeError(f"Model request rejected with status {status}")


def _retry_after(headers: Mapping[str, str]) -> float | None:
    value = headers.get("retry-after")

    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def validated_usage(
    actual_input,
    actual_output,
    cached,
    total,
    maximum_output: int,
    remaining: int,
    maximum_input: int | None = None,
) -> GenerationUsage:
    if (
        type(actual_input) is not int
        or type(actual_output) is not int
        or actual_input < 0
        or (maximum_input is not None and actual_input > maximum_input)
        or not 0 <= actual_output <= maximum_output
    ):
        raise RuntimeError("Invalid model usage; retain the conservative attempt charge")
    if type(cached) is not int or not 0 <= cached <= actual_input:
        raise RuntimeError("Invalid cached token usage")
    if total is not MISSING and (type(total) is not int or total != actual_input + actual_output):
        raise RuntimeError("Inconsistent model usage")
    if actual_input + actual_output > remaining:
        raise RuntimeError("Model usage exceeds the admitted budget")

    return GenerationUsage(actual_input, actual_output, cached)
