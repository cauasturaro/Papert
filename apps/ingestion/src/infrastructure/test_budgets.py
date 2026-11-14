from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.infrastructure.embeddings import BATCH_SIZE, OpenAIEmbeddings
from src.infrastructure.extraction import DocumentExtractor

pytestmark = pytest.mark.unit


def test_embedding_stops_before_another_paid_batch_when_budget_is_exhausted(monkeypatch):
    clock = iter([10.0, 15.0])
    monkeypatch.setattr("src.infrastructure.embeddings.time.monotonic", lambda: next(clock))
    client = Mock()
    client.embeddings.create.return_value = SimpleNamespace(
        data=[SimpleNamespace(index=index, embedding=[0.0] * 1536) for index in range(BATCH_SIZE)],
        usage=SimpleNamespace(prompt_tokens=10, total_tokens=10),
    )
    embedder = OpenAIEmbeddings(client=client, deadline=14.0)

    with pytest.raises(TimeoutError, match="budget exhausted"):
        embedder.embed(["text"] * (BATCH_SIZE + 1))

    assert client.embeddings.create.call_count == 1
    assert client.embeddings.create.call_args.kwargs["timeout"] == 4.0


def test_extraction_does_not_start_when_invocation_budget_is_exhausted(monkeypatch):
    monkeypatch.setattr("src.infrastructure.extraction.time.monotonic", lambda: 10.0)
    context = Mock()
    monkeypatch.setattr("src.infrastructure.extraction.multiprocessing.get_context", context)

    with pytest.raises(TimeoutError, match="budget exhausted"):
        DocumentExtractor(deadline=9.0).extract("md", b"text")

    context.assert_not_called()


def test_unresponsive_parser_is_terminated_and_joined(monkeypatch):
    context = Mock()
    reader, writer = Mock(), Mock()
    reader.poll.return_value = False
    context.Pipe.return_value = reader, writer
    process = context.Process.return_value
    monkeypatch.setattr(
        "src.infrastructure.extraction.multiprocessing.get_context", lambda _method: context
    )

    with pytest.raises(TimeoutError, match="time budget"):
        DocumentExtractor().extract("doc", b"malformed")

    process.terminate.assert_called_once()
    process.join.assert_called_once()
    reader.close.assert_called_once()
    writer.close.assert_called()
