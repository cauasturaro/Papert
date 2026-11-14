"""What provider adapters tell the tracer about one model call, and what that call cost."""

from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class GenerationCall:
    provider: str
    model: str
    effort: str
    # Exact preflight count, or a conservative estimate when the provider cannot count.
    input_tokens: int
    input_exact: bool
    max_output: int
    prompt: str
    prompt_version: str


@dataclass(frozen=True)
class GenerationUsage:
    input: int
    output: int
    cached: int


class GenerationRecord(Protocol):
    def usage(self, usage: GenerationUsage) -> None: ...


GenerationObserver = Callable[[GenerationCall], AbstractContextManager[GenerationRecord]]


# USD per million tokens: uncached input, cached input, output. DeepSeek uses its peak rates
# (the upper bound of its time-of-day pricing) so cost is never under-reported.
MODEL_PRICES = {
    "text-embedding-3-small": (0.02, 0.02, 0),
    "text-embedding-3-large": (0.13, 0.13, 0),
    "gpt-5-nano": (0.05, 0.005, 0.40),
    "gpt-5-nano-2025-08-07": (0.05, 0.005, 0.40),
    "gpt-5.4-nano": (0.20, 0.02, 1.25),
    "gpt-5.4-nano-2026-03-17": (0.20, 0.02, 1.25),
    "deepseek-flash": (0.30, 0.006, 1.20),
}


def cost_details(model: str, usage: GenerationUsage) -> dict[str, float] | None:
    prices = MODEL_PRICES.get(model)
    if prices is None:
        return None

    input_price, cached_price, output_price = prices
    uncached = usage.input - usage.cached

    return {
        "input": (uncached * input_price + usage.cached * cached_price) / 1_000_000,
        "output": usage.output * output_price / 1_000_000,
    }
