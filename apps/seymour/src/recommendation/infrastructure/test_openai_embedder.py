from unittest.mock import MagicMock, patch

import pytest
import tiktoken

from src.recommendation.infrastructure.openai_embedder import OpenAITextEmbedder

pytestmark = pytest.mark.unit


def test_counts_unicode_and_special_token_text_exactly_and_loads_encoding_once():
    embedder = OpenAITextEmbedder(client=MagicMock())
    encoding = tiktoken.encoding_for_model(embedder.model)
    texts = ["😀" * 100, "Learn PostgreSQL relationships", "<|endoftext|>"]

    with patch(
        "src.recommendation.infrastructure.openai_embedder.tiktoken.encoding_for_model",
        return_value=encoding,
    ) as load_encoding:
        counts = [embedder.count_tokens(text) for text in texts]

    assert counts == [len(encoding.encode(text, disallowed_special=())) for text in texts]
    assert counts[0] > len(texts[0]) / 3
    load_encoding.assert_called_once_with(embedder.model)
    embedder.client.embeddings.create.assert_not_called()
