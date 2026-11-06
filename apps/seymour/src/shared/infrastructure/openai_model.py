"""LangChain OpenAI Responses adapter with exact preflight token admission and no SDK retries."""

import time

import openai
from httpx import Client, HTTPStatusError, Response, TimeoutException, TransportError
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI

from src.shared.domain.inference import (
    BudgetExceeded,
    Message,
    ModelTask,
    ModelUnavailable,
    TutorCancelled,
)
from src.shared.infrastructure.generation import GenerationCall, GenerationObserver, GenerationUsage

DEFAULT_MODEL = "gpt-5.4-nano-2026-03-17"
# Output reservation per reasoning effort; roadmap generation passes larger limits.
OUTPUT_LIMITS = {"low": 2048, "medium": 3072, "high": 4096}
# Generation-only fields; the count endpoint rejects routing fields such as the cache key.
NOT_COUNTED = {"max_output_tokens", "store", "include", "stream", "prompt_cache_key"}


class OpenAIModel:
    def __init__(
        self,
        api_key: str,
        model: str,
        generation_observer: GenerationObserver,
        task: ModelTask,
        cache_key: str | None = None,
        base_url: str = "https://api.openai.com/v1/",
    ):
        if not api_key.strip():
            raise ValueError("OPENAI_API_KEY is required")

        self._history: dict[int, tuple[Message, BaseMessage]] = {}
        self.api_key = api_key
        self.model = model
        self.generation_observer = generation_observer
        self.task = task
        self.response_name = task.name
        self.response_schema = task.schema
        self.output_limits = task.output_limits or OUTPUT_LIMITS
        # Routes requests with the same stable prefix to the same provider cache.
        self.cache_key = cache_key
        self.base_url = base_url

    def complete(self, messages: list[Message], tools, effort, remaining, deadline, active):
        message_ids = {id(message) for message in messages}
        self._history = {key: entry for key, entry in self._history.items() if key in message_ids}
        provider_messages = [self._to_langchain(message) for message in messages]

        maximum_output = self.output_limits[effort]
        payload = {}

        def capture_response(response):
            # Validate original usage before the SDK normalizes missing token fields.
            if response.is_success and response.request.url.path == "/v1/responses":
                response.read()
                payload.update(response.json())

        extra = {}
        if self.cache_key is not None:
            extra["prompt_cache_key"] = self.cache_key

        with Client(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {self.api_key}"},
            trust_env=False,
            event_hooks={"response": [capture_response]},
        ) as client:
            model = ChatOpenAI(
                api_key=self.api_key,
                model=self.model,
                base_url=self.base_url,
                http_client=client,
                use_responses_api=True,
                output_version="responses/v1",
                use_previous_response_id=False,
                max_retries=0,
                store=False,
                include=["reasoning.encrypted_content"],
                reasoning={"effort": effort},
                truncation="disabled",
                max_tokens=maximum_output,
                model_kwargs={
                    **extra,
                    "text": {
                        "format": {
                            "type": "json_schema",
                            "name": self.response_name,
                            "schema": self.response_schema,
                            "strict": True,
                        }
                    },
                },
            )
            parameters = {
                "tools": [
                    {
                        "type": "function",
                        "name": tool["name"],
                        "description": tool["description"],
                        "parameters": tool["input_schema"],
                        "strict": False,
                    }
                    for tool in tools
                ],
                "parallel_tool_calls": False,
            }
            # shortcut: exact preflight needs the private serializer; check payload parity on upgrades.
            request = model._get_request_payload(provider_messages, **parameters)
            count_request = {key: value for key, value in request.items() if key not in NOT_COUNTED}

            # Counting is free, so its failures never charge the attempt.
            try:
                count = client.post(
                    "responses/input_tokens",
                    json=count_request,
                    timeout=max(0.1, deadline - time.monotonic()),
                )
                count.raise_for_status()
            except TimeoutException:
                raise ModelUnavailable("timeout") from None
            except HTTPStatusError as error:
                raise _status_failure(error.response) from None
            except TransportError:
                raise ModelUnavailable("server_error") from None

            input_tokens = count.json().get("input_tokens")
            if type(input_tokens) is not int or input_tokens < 0:
                raise RuntimeError("Invalid preflight token count")
            if input_tokens + maximum_output > remaining:
                raise BudgetExceeded()
            if not active():
                raise TutorCancelled()
            if time.monotonic() >= deadline:
                raise TimeoutError("Tutor deadline reached before inference")

            call = GenerationCall(
                provider="openai",
                model=self.model,
                effort=effort,
                input_tokens=input_tokens,
                input_exact=True,
                max_output=maximum_output,
                prompt=self.task.prompt.id,
                prompt_version=self.task.prompt.version,
            )

            with self.generation_observer(call) as generation:
                try:
                    response = model.invoke(
                        provider_messages,
                        config={"callbacks": []},
                        **parameters,
                        timeout=max(0.1, deadline - time.monotonic()),
                    )
                except openai.APITimeoutError:
                    # The provider may still finish and bill a request the client abandoned.
                    raise ModelUnavailable(
                        "timeout", charged=input_tokens + maximum_output
                    ) from None
                except openai.APIStatusError as error:
                    if error.status_code == 429 or error.status_code >= 500:
                        raise _status_failure(error.response) from None
                    raise
                except openai.APIConnectionError:
                    raise ModelUnavailable("server_error") from None

                usage = payload.get("usage", {})
                actual_input = usage.get("input_tokens")
                actual_output = usage.get("output_tokens")
                if (
                    type(actual_input) is not int
                    or type(actual_output) is not int
                    or not 0 <= actual_input <= input_tokens
                    or not 0 <= actual_output <= maximum_output
                ):
                    raise RuntimeError(
                        "Invalid model usage; retain the conservative attempt charge"
                    )

                cached = usage.get("input_tokens_details", {}).get("cached_tokens", 0)
                if type(cached) is not int or not 0 <= cached <= actual_input:
                    raise RuntimeError("Invalid cached token usage")

                normalized_usage = response.usage_metadata
                if (
                    not normalized_usage
                    or normalized_usage["total_tokens"] != actual_input + actual_output
                ):
                    raise RuntimeError("Inconsistent model usage")

                generation.usage(GenerationUsage(actual_input, actual_output, cached))

        if payload.get("status") != "completed":
            response = response.model_copy(update={"content": "", "tool_calls": []})

        result = from_langchain(response)
        # Replay provider reasoning and call IDs unchanged across tool/repair turns.
        self._history[id(result)] = (result, response)

        return result

    def _to_langchain(self, message: Message) -> BaseMessage:
        previous = self._history.get(id(message))
        if previous is not None:
            return previous[1]

        if message.role == "system":
            return SystemMessage(content=message.content)
        if message.role == "user":
            return HumanMessage(content=message.content)
        if message.role == "tool":
            return ToolMessage(
                content=message.content, tool_call_id=message.tool_call_id, name=message.name
            )

        return AIMessage(content=message.content, tool_calls=message.tool_calls)


def _status_failure(response: Response) -> Exception:
    """429 and 5xx mean the provider is unavailable; other statuses are request errors."""
    status = response.status_code

    if status == 429:
        return ModelUnavailable("rate_limited", retry_after=_retry_after(response))
    if status >= 500:
        return ModelUnavailable("server_error")

    return RuntimeError(f"Model request rejected with status {status}")


def _retry_after(response: Response) -> float | None:
    value = response.headers.get("retry-after")

    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def from_langchain(response: AIMessage) -> Message:
    """Select the last final answer while keeping Responses phases inside this adapter."""
    final_blocks = [
        block
        for block in response.content
        if isinstance(block, dict) and block.get("phase") == "final_answer"
    ]
    text = response.text

    if final_blocks:
        final_message_id = final_blocks[-1].get("id")
        text = "".join(
            block["text"]
            for block in final_blocks
            if block.get("type") == "text"
            and (not final_message_id or block.get("id") == final_message_id)
        )

    usage = None
    if response.usage_metadata:
        usage = {
            "input_tokens": response.usage_metadata["input_tokens"],
            "output_tokens": response.usage_metadata["output_tokens"],
            "total_tokens": response.usage_metadata["total_tokens"],
        }

    calls = [
        {"id": call["id"], "name": call["name"], "args": call["args"]}
        for call in response.tool_calls
    ]

    return Message(role="assistant", content=text, tool_calls=calls, usage=usage)
