import logging

import pytest

from src.shared.application.fallback_model import Route
from src.shared.infrastructure.fake_model import FakeModel
from src.shared.infrastructure.model_provider import FakeModelRefused, model_provider
from src.shared.infrastructure.models import model_for, provider_model, settings_from_env
from src.tutor.application.guidance import guidance_task

pytestmark = pytest.mark.unit


class Trace:
    def generation(self, _call):
        raise AssertionError("not called while composing")

    def fallback(self, _event):
        pass


def test_openai_is_the_default_provider():
    assert model_provider({}) == "openai"
    assert model_provider({"MODEL_PROVIDER": "openai"}) == "openai"


def test_the_fake_provider_needs_an_explicit_opt_in_and_says_so(caplog):
    with caplog.at_level(logging.WARNING):
        provider = model_provider({"MODEL_PROVIDER": "fake", "ENVIRONMENT": "e2e"})

    assert provider == "fake"
    assert "fake_model_provider_enabled_answers_are_not_real" in caplog.messages


def test_an_unknown_provider_is_a_configuration_error():
    with pytest.raises(ValueError):
        model_provider({"MODEL_PROVIDER": "fakeish"})


@pytest.mark.parametrize(
    "environ",
    [
        {"MODEL_PROVIDER": "fake", "ENVIRONMENT": "prod"},
        {"MODEL_PROVIDER": "fake", "ENVIRONMENT": "staging"},
        {"MODEL_PROVIDER": "fake", "AWS_LAMBDA_FUNCTION_NAME": "papert-seymour-local-worker"},
    ],
)
def test_the_fake_provider_is_refused_where_learners_could_see_it(environ):
    with pytest.raises(FakeModelRefused):
        model_provider(environ)


def test_fake_settings_build_a_model_without_a_provider_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    monkeypatch.setenv("MODEL_PROVIDER", "fake")

    settings = settings_from_env()
    model = model_for(guidance_task(), settings, Trace(), Route())

    assert settings.provider == "fake"
    assert [provider.name for provider in model.providers] == ["fake"]
    assert isinstance(model.providers[0].model, FakeModel)


def test_fake_settings_never_hand_out_a_real_provider(monkeypatch):
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    monkeypatch.setenv("MODEL_PROVIDER", "fake")

    settings = settings_from_env()

    with pytest.raises(ValueError):
        provider_model("openai", guidance_task(), settings, Trace())
