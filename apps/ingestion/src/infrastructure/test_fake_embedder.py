import importlib.util
import math
from pathlib import Path
from unittest.mock import Mock

import pytest

from src.infrastructure.composition import build_ports
from src.infrastructure.fake_embedder import FakeEmbedder
from src.infrastructure.model_provider import FakeModelRefused, model_provider

pytestmark = pytest.mark.unit


def test_vectors_match_seymour_queries_exactly():
    path = (
        Path(__file__).resolve().parents[3] / "seymour/src/shared/infrastructure/fake_embedder.py"
    )
    spec = importlib.util.spec_from_file_location("seymour_fake_embedder", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    query_embedder = module.FakeEmbedder()
    texts = ["Python functions functions", "Olá, código 123", "", "!!!"]

    embedded = FakeEmbedder().embed(texts)
    expected, tokens = query_embedder.embed_many(texts)

    assert embedded.model == query_embedder.model == "papert-fake-embedding"
    assert embedded.vectors == expected
    assert embedded.tokens == tokens
    for vector in embedded.vectors:
        assert len(vector) == 1536
        assert sum(value * value for value in vector) == pytest.approx(1)
        assert all(math.isfinite(value) for value in vector)
    assert FakeEmbedder().embed([]).vectors == []


@pytest.mark.parametrize("stage", ["local", "e2e", "test"])
def test_fake_provider_is_explicit_and_loud(stage, caplog):
    assert model_provider({}) == "openai"
    assert model_provider({"MODEL_PROVIDER": "openai"}) == "openai"

    provider = model_provider({"MODEL_PROVIDER": "fake", "ENVIRONMENT": stage})

    assert provider == "fake"
    assert "fake_embedding_provider_enabled_vectors_are_not_real" in caplog.messages


@pytest.mark.parametrize(
    "environ",
    [
        {"ENVIRONMENT": "prod"},
        {"ENVIRONMENT": "staging"},
        {"ENVIRONMENT": ""},
        {"AWS_LAMBDA_FUNCTION_NAME": "papert-ingestion-local"},
    ],
)
def test_fake_provider_is_refused_in_deployments(environ):
    with pytest.raises(FakeModelRefused):
        model_provider({"MODEL_PROVIDER": "fake", **environ})


def test_unknown_provider_is_rejected():
    with pytest.raises(ValueError, match="MODEL_PROVIDER"):
        model_provider({"MODEL_PROVIDER": "fakeish"})


def test_composition_selects_fake_without_openai_key(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "fake")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    for name in ["S3Objects", "S3Renditions", "IngestionTrace"]:
        monkeypatch.setattr(f"src.infrastructure.composition.{name}", Mock())

    ports = build_ports(Mock(), Mock())

    assert isinstance(ports.embeddings, FakeEmbedder)


@pytest.mark.parametrize(
    "environ",
    [
        {},
        {"MODEL_PROVIDER": "openai"},
        *[
            {"MODEL_PROVIDER": "fake", "ENVIRONMENT": stage}
            for stage in ["local", "e2e", "test", "prod", "staging", ""]
        ],
        {"MODEL_PROVIDER": "fake", "AWS_LAMBDA_FUNCTION_NAME": "worker"},
        {"MODEL_PROVIDER": "unknown"},
    ],
)
def test_provider_safeguards_match_seymour(environ):
    path = (
        Path(__file__).resolve().parents[3] / "seymour/src/shared/infrastructure/model_provider.py"
    )
    spec = importlib.util.spec_from_file_location("seymour_provider", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def outcome(select):
        try:
            return select(environ)
        except (ValueError, RuntimeError) as error:
            return type(error).__name__

    assert outcome(model_provider) == outcome(module.model_provider)
