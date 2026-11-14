"""Builds each task's provider chain: OpenAI first, DeepSeek as the optional fallback.

With MODEL_PROVIDER=fake the chain is the deterministic fake model alone.
"""

import os
import time
from dataclasses import dataclass

from src.shared.application.fallback_model import FallbackModel, Provider, Route
from src.shared.domain.inference import Model, ModelTask
from src.shared.infrastructure.fake_model import FAKE_MODEL_NAME, FakeModel
from src.shared.infrastructure.model_provider import (
    FAKE_PROVIDER,
    OPENAI_PROVIDER,
    ModelProvider,
    model_provider,
)
from src.shared.infrastructure.openai_model import DEFAULT_MODEL, OpenAIModel

DEFAULT_FALLBACK_MODEL = "deepseek-flash"


@dataclass(frozen=True)
class ModelSettings:
    openai_key: str
    openai_model: str
    # The fallback is enabled only when its key is configured.
    deepseek_key: str | None
    deepseek_model: str
    openai_base_url: str = "https://api.openai.com/v1/"
    provider: ModelProvider = OPENAI_PROVIDER


def settings_from_env() -> ModelSettings:
    if model_provider() == FAKE_PROVIDER:
        return ModelSettings(
            openai_key="",
            openai_model="",
            deepseek_key=None,
            deepseek_model=DEFAULT_FALLBACK_MODEL,
            provider=FAKE_PROVIDER,
        )

    return ModelSettings(
        openai_key=os.environ["OPENAI_API_KEY"],
        openai_model=os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        deepseek_key=os.environ.get("DEEPSEEK_API_KEY") or None,
        deepseek_model=os.environ.get("DEEPSEEK_MODEL", DEFAULT_FALLBACK_MODEL),
    )


def provider_names(settings: ModelSettings) -> list[str]:
    if settings.provider == FAKE_PROVIDER:
        return [FAKE_PROVIDER]

    return ["openai", "deepseek"] if settings.deepseek_key else ["openai"]


def model_name(provider: str, settings: ModelSettings) -> str:
    if provider == FAKE_PROVIDER:
        return FAKE_MODEL_NAME

    return settings.openai_model if provider == "openai" else settings.deepseek_model


def provider_model(provider: str, task: ModelTask, settings: ModelSettings, trace) -> Model:
    """A single provider's adapter; evals use it to measure one model at a time."""
    if provider == FAKE_PROVIDER and settings.provider == FAKE_PROVIDER:
        return FakeModel(task, trace.generation)

    if provider == "openai":
        return OpenAIModel(
            settings.openai_key,
            settings.openai_model,
            trace.generation,
            task,
            # Requests of one task share their stable prefix, so they share a cache route.
            cache_key=f"papert-{task.name}",
            base_url=settings.openai_base_url,
        )

    if provider == "deepseek" and settings.deepseek_key:
        from src.shared.infrastructure.deepseek_model import DeepSeekModel

        return DeepSeekModel(
            settings.deepseek_key,
            settings.deepseek_model,
            trace.generation,
            task,
        )

    raise ValueError(f"Model provider {provider} is not configured")


def model_for(task: ModelTask, settings: ModelSettings, trace, route: Route) -> Model:
    """One route per execution keeps its tutor, summary and repair calls on one provider."""
    providers = [
        Provider(name, provider_model(name, task, settings, trace))
        for name in provider_names(settings)
    ]

    return FallbackModel(providers, route, time.monotonic, time.sleep, trace.fallback)
