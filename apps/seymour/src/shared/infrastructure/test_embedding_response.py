from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.shared.infrastructure.openai_embeddings import OpenAIEmbeddings

pytestmark = pytest.mark.unit


def response(indices=(0,), dimensions=1536, tokens=1, total=1):
    return SimpleNamespace(
        data=[SimpleNamespace(index=index, embedding=[0.0] * dimensions) for index in indices],
        usage=SimpleNamespace(prompt_tokens=tokens, total_tokens=total),
    )


@pytest.mark.parametrize(
    "invalid",
    [
        response(indices=()),
        response(indices=(1,)),
        response(indices=(0, 0)),
        response(dimensions=2),
        response(tokens=-1),
        response(tokens=True),
        response(total=2),
    ],
)
def test_invalid_provider_response_is_rejected(invalid):
    client = Mock()
    client.embeddings.create.return_value = invalid
    embedder = OpenAIEmbeddings(client=client)

    with pytest.raises(RuntimeError):
        embedder.embed_many(["text"])


def test_response_is_ordered_by_request_index():
    client = Mock()
    client.embeddings.create.return_value = response(indices=(1, 0))
    embedder = OpenAIEmbeddings(client=client)

    result = embedder.embed_many(["first", "second"])

    assert len(result[0]) == 2 and result[1] == 1
