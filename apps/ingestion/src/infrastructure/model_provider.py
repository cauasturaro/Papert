"""Which embedding provider runs: OpenAI by default, or the deterministic fake when opted in."""

import logging
import os
from collections.abc import Mapping
from typing import Literal

ModelProvider = Literal["openai", "fake"]

OPENAI_PROVIDER: ModelProvider = "openai"
FAKE_PROVIDER: ModelProvider = "fake"

# Deployed stages set ENVIRONMENT to their stage name; only these may run the fake model.
FAKE_ENVIRONMENTS = {"local", "e2e", "test"}

log = logging.getLogger(__name__)


class FakeModelRefused(RuntimeError):
    """The fake model was requested where real sources could receive demo vectors."""


def model_provider(environ: Mapping[str, str] = os.environ) -> ModelProvider:
    """The configured provider; the fake one only on an explicit opt-in outside deployed stages."""
    requested = environ.get("MODEL_PROVIDER", "").strip().lower()

    if requested in {"", OPENAI_PROVIDER}:
        return OPENAI_PROVIDER

    if requested != FAKE_PROVIDER:
        raise ValueError("MODEL_PROVIDER must be 'openai' or 'fake'")

    if environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        raise FakeModelRefused("The fake model provider cannot run on AWS Lambda")

    stage = environ.get("ENVIRONMENT", "local").strip().lower()
    if stage not in FAKE_ENVIRONMENTS:
        raise FakeModelRefused("The fake model provider cannot run in a deployed stage")

    # Logged on every selection so no run can miss that vectors are synthetic.
    log.warning("fake_embedding_provider_enabled_vectors_are_not_real")

    return FAKE_PROVIDER
