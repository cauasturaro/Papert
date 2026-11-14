"""DeepSeek Chat Completions adapter with conservative local budget admission."""

import json
import math
import time

import httpx
import tiktoken

from src.shared.domain.inference import (
    Message,
    ModelTask,
    ModelUnavailable,
    TutorCancelled,
    fitted_output,
)
from src.shared.infrastructure.generation import GenerationCall, GenerationObserver, GenerationUsage
from src.shared.infrastructure.openai_model import OUTPUT_LIMITS
from src.shared.infrastructure.provider_response import MISSING, status_failure, validated_usage

SCHEMA_INSTRUCTION = "Return only a json object matching this JSON Schema:\n"
# DeepSeek has no count endpoint, so admission pads a local cl100k estimate of the request
# body. The margin is a conservative guess; it has not been checked against DeepSeek's
# reported prompt_tokens.
ESTIMATE_MARGIN = 1.25
ESTIMATE_OVERHEAD = 64


class DeepSeekModel:
    def __init__(
        self,
        api_key: str,
        model: str,
        generation_observer: GenerationObserver,
        task: ModelTask,
        *,
        transport: httpx.BaseTransport | None = None,
        base_url: str = "https://api.deepseek.com",
    ):
        if not api_key.strip():
            raise ValueError("DEEPSEEK_API_KEY is required")

        self._history: dict[int, tuple[Message, dict]] = {}
        self.api_key = api_key
        self.model = model
        self.generation_observer = generation_observer
        self.task = task
        self.output_limits = task.output_limits or OUTPUT_LIMITS
        self.transport = transport
        self.base_url = base_url
        self._encoding = tiktoken.get_encoding("cl100k_base")

    def complete(self, messages: list[Message], tools, effort, remaining, deadline, active):
        message_ids = {id(message) for message in messages}
        self._history = {key: entry for key, entry in self._history.items() if key in message_ids}
        schema_message = {
            "role": "system",
            "content": SCHEMA_INSTRUCTION + json.dumps(self.task.schema, separators=(",", ":")),
        }
        body = {
            "model": self.model,
            "messages": [schema_message, *[self._to_provider(message) for message in messages]],
            "response_format": {"type": "json_object"},
            "reasoning_effort": "low" if effort == "low" else "high",
            "stream": False,
        }
        if tools:
            body["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool["name"],
                        "description": tool["description"],
                        "parameters": tool["input_schema"],
                    },
                }
                for tool in tools
            ]
            body["parallel_tool_calls"] = False

        tokens = self._encoding.encode(json.dumps(body), disallowed_special=())
        estimate = math.ceil(len(tokens) * ESTIMATE_MARGIN) + ESTIMATE_OVERHEAD
        maximum_output = fitted_output(self.output_limits[effort], estimate, remaining, self.task)

        if not active():
            raise TutorCancelled()
        if time.monotonic() >= deadline:
            # The provider's share elapsed before the call; a fallback may still answer.
            raise ModelUnavailable("timeout")

        body["max_tokens"] = maximum_output
        call = GenerationCall(
            provider="deepseek",
            model=self.model,
            effort=effort,
            input_tokens=estimate,
            input_exact=False,
            max_output=maximum_output,
            prompt=self.task.prompt.id,
            prompt_version=self.task.prompt.version,
        )

        with self.generation_observer(call) as record:
            with httpx.Client(
                base_url=self.base_url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                trust_env=False,
                transport=self.transport,
            ) as client:
                try:
                    response = client.post(
                        "chat/completions",
                        json=body,
                        timeout=max(0.1, deadline - time.monotonic()),
                    )
                except httpx.TimeoutException:
                    raise ModelUnavailable("timeout", charged=estimate + maximum_output) from None
                except httpx.TransportError:
                    raise ModelUnavailable("server_error") from None

            if not response.is_success:
                raise status_failure(response.status_code, response.headers)

            payload = response.json()
            usage = _validated_usage(payload.get("usage"), maximum_output, remaining)
            record.usage(usage)

        choice = payload["choices"][0]
        provider_message = choice["message"]
        content, tool_calls = _output(choice)
        result = Message(
            role="assistant",
            content=content,
            tool_calls=tool_calls,
            usage={
                "input_tokens": usage.input,
                "output_tokens": usage.output,
                "total_tokens": usage.input + usage.output,
            },
        )
        # Replay provider reasoning and call IDs unchanged across tool/repair turns.
        self._history[id(result)] = (result, provider_message)

        return result

    def _to_provider(self, message: Message) -> dict:
        previous = self._history.get(id(message))
        if previous is not None:
            return previous[1]

        result: dict[str, object] = {"role": message.role, "content": message.content}
        if message.role == "tool":
            result["tool_call_id"] = message.tool_call_id
        if message.role == "assistant" and message.tool_calls:
            result["tool_calls"] = [
                {
                    "id": call["id"],
                    "type": "function",
                    "function": {"name": call["name"], "arguments": json.dumps(call["args"])},
                }
                for call in message.tool_calls
            ]

        return result


def _validated_usage(usage, maximum_output: int, remaining: int) -> GenerationUsage:
    if not isinstance(usage, dict):
        raise RuntimeError("Invalid model usage")

    return validated_usage(
        usage.get("prompt_tokens"),
        usage.get("completion_tokens"),
        usage.get("prompt_cache_hit_tokens", 0),
        usage.get("total_tokens", MISSING),
        maximum_output,
        remaining,
    )


def _output(choice: dict) -> tuple[str, list]:
    if choice.get("finish_reason") == "length":
        return "", []

    message = choice["message"]
    content = message.get("content") or ""
    try:
        calls = [
            {
                "id": call["id"],
                "name": call["function"]["name"],
                "args": json.loads(call["function"]["arguments"]),
            }
            for call in message.get("tool_calls") or []
        ]
    except json.JSONDecodeError:
        return "", []

    if not content.strip() and not calls:
        return "", []

    return content, calls
