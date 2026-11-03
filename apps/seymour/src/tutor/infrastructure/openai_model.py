"""LangChain OpenAI Responses adapter with exact preflight token admission and no SDK retries."""

import time

from httpx import Client
from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI

from src.tutor.application.tutor import BudgetExceeded, Guidance, TutorCancelled

DEFAULT_MODEL = "gpt-5.4-nano-2026-03-17"
# Standard USD per million tokens: uncached input, cached input, output.
MODEL_PRICES = {
    "gpt-5-nano": (0.05, 0.005, 0.40),
    "gpt-5-nano-2025-08-07": (0.05, 0.005, 0.40),
    "gpt-5.4-nano": (0.20, 0.02, 1.25),
    "gpt-5.4-nano-2026-03-17": (0.20, 0.02, 1.25),
}


class OpenAIModel:
    def __init__(self, api_key: str, model: str, generation_observer):
        if not api_key.strip():
            raise ValueError("OPENAI_API_KEY is required")

        self.api_key = api_key
        self.model = model
        self.generation_observer = generation_observer

    def complete(self, messages: list[BaseMessage], tools, effort, remaining, deadline, active):
        maximum_output = {"low": 2048, "medium": 3072, "high": 4096}[effort]
        payload = {}

        def capture_response(response):
            # Validate original usage before the SDK normalizes missing token fields.
            if response.is_success and response.request.url.path == "/v1/responses":
                response.read()
                payload.update(response.json())

        with Client(
            base_url="https://api.openai.com/v1/",
            headers={"Authorization": f"Bearer {self.api_key}"},
            trust_env=False,
            event_hooks={"response": [capture_response]},
        ) as client:
            model = ChatOpenAI(
                api_key=self.api_key,
                model=self.model,
                base_url="https://api.openai.com/v1/",
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
                    "text": {
                        "format": {
                            "type": "json_schema",
                            "name": "tutor_guidance",
                            "schema": Guidance.model_json_schema(),
                            "strict": True,
                        }
                    }
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
            request = model._get_request_payload(messages, **parameters)
            count_request = {
                key: value
                for key, value in request.items()
                if key not in {"max_output_tokens", "store", "include", "stream"}
            }
            count = client.post(
                "responses/input_tokens",
                json=count_request,
                timeout=max(0.1, deadline - time.monotonic()),
            )
            count.raise_for_status()
            input_tokens = count.json().get("input_tokens")
            if type(input_tokens) is not int or input_tokens < 0:
                raise RuntimeError("Invalid preflight token count")
            if input_tokens + maximum_output > remaining:
                raise BudgetExceeded()
            if not active():
                raise TutorCancelled()
            if time.monotonic() >= deadline:
                raise TimeoutError("Tutor deadline reached before inference")

            with self.generation_observer(
                self.model, effort, input_tokens, maximum_output
            ) as generation:
                response = model.invoke(
                    messages,
                    config={"callbacks": []},
                    **parameters,
                    timeout=max(0.1, deadline - time.monotonic()),
                )
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

                generation.update(
                    usage_details={
                        "input": actual_input,
                        "output": actual_output,
                        "total": actual_input + actual_output,
                        "cache_read_input_tokens": cached,
                    }
                )
                prices = MODEL_PRICES.get(self.model)
                if prices:
                    input_price, cached_price, output_price = prices
                    generation.update(
                        cost_details={
                            "input": ((actual_input - cached) * input_price + cached * cached_price)
                            / 1_000_000,
                            "output": actual_output * output_price / 1_000_000,
                        }
                    )

        if payload.get("status") != "completed":
            return response.model_copy(update={"content": "", "tool_calls": []})

        return response
