from unittest.mock import Mock

import pytest

from evals.memory_runtime import RecordingModel, Runtime
from evals.runtime import MeteredEmbeddings, parse_run_count, select_cases, write_report
from evals.spend import SpendCapReached, SpendLedger
from src.shared.domain.inference import Message

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("selected", [["missing"], ["known", "missing"]])
def test_unknown_ids_are_rejected(selected):
    with pytest.raises(ValueError, match="Unknown case IDs"):
        select_cases([{"id": "known"}], selected)


@pytest.mark.parametrize(
    "cases,selected,split", [([], [], "all"), ([{"id": "x", "split": "tuning"}], [], "holdout")]
)
def test_empty_selections_are_rejected(cases, selected, split):
    with pytest.raises(ValueError, match="No evaluation cases"):
        select_cases(cases, selected, split)


@pytest.mark.parametrize("value", ["0", "-1", "no"])
def test_run_count_must_be_positive(value):
    with pytest.raises(ValueError):
        parse_run_count(value)


def test_selection_preserves_dataset_order():
    cases = [{"id": "a"}, {"id": "b"}]

    selected = select_cases(cases, ["b", "a"])

    assert selected == cases
    assert parse_run_count("2") == 2


def test_report_is_json_with_a_trailing_newline(tmp_path):
    path = tmp_path / "report.json"

    write_report(str(path), {"suite": "test"})

    assert path.read_text() == '{\n  "suite": "test"\n}\n'


def test_recording_model_keeps_provider_method_unchanged():
    model = Mock()
    model.complete.return_value = Message("assistant", "answer")
    complete = model.complete
    recording = RecordingModel(model)

    response = recording.complete([], [], "low", 100, 10, lambda: True)

    assert response.content == "answer"
    assert recording.raw == ["answer"]
    assert model.complete is complete


@pytest.mark.parametrize(
    "failure,retries", [("unavailable", 1), ("invalid", 0), ("budget", 0), (None, 0)]
)
def test_memory_retries_only_returned_provider_failures(failure, retries):
    runtime = Runtime.__new__(Runtime)
    runtime.retries = 0
    runtime._ask = Mock(return_value=({"failure": failure}, None))

    runtime.ask(None, "question")

    assert runtime.retries == retries
    assert runtime._ask.call_count == 1 + retries


def test_embedding_admission_blocks_the_sdk_before_spending(tmp_path):
    client = Mock()
    ledger = SpendLedger(tmp_path / "ledger.json", 0, "test")
    embedder = MeteredEmbeddings(ledger, client=client)
    embedder.count_tokens = lambda text: 10

    with pytest.raises(SpendCapReached):
        embedder.embed_many(["text"])

    client.embeddings.create.assert_not_called()


def test_failed_embedding_retains_the_admitted_charge(tmp_path):
    client = Mock()
    client.embeddings.create.side_effect = TimeoutError()
    ledger = SpendLedger(tmp_path / "ledger.json", 1, "test")
    embedder = MeteredEmbeddings(ledger, client=client)
    embedder.count_tokens = lambda text: 10

    with pytest.raises(TimeoutError):
        embedder.embed_many(["text"])

    assert ledger.spent() == pytest.approx(10 * 0.02 / 1_000_000)


def test_memory_does_not_retry_programming_errors():
    runtime = Runtime.__new__(Runtime)
    runtime.retries = 0
    runtime._ask = Mock(side_effect=ValueError("invalid context"))

    with pytest.raises(ValueError, match="invalid context"):
        runtime.ask(None, "question")

    assert runtime._ask.call_count == 1
    assert runtime.retries == 0
