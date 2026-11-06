from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from evals.spend import MeteredTrace, SpendCapReached, SpendLedger
from src.shared.infrastructure.generation import GenerationCall, GenerationUsage

pytestmark = pytest.mark.unit


def call(model="gpt-5.4-nano-2026-03-17", input_tokens=1000, max_output=2048):
    return GenerationCall("openai", model, "low", input_tokens, True, max_output, "p", "sha:0")


class Trace:
    def __init__(self):
        self.record = MagicMock()

    @contextmanager
    def generation(self, _call):
        yield self.record


def test_recorded_spend_accumulates_across_ledger_instances(tmp_path):
    path = tmp_path / "spend.json"
    first = SpendLedger(path, 0.5, "evaluation")
    second = SpendLedger(path, 0.5, "tutor")

    first.record(call(), GenerationUsage(1000, 500, 0))
    second.record(call(), GenerationUsage(1000, 500, 200))

    assert first.spent() == pytest.approx(0.0002 + 0.000625 + 0.000164 + 0.000625)


def test_a_call_that_could_cross_the_cap_is_refused_before_it_starts(tmp_path):
    ledger = SpendLedger(tmp_path / "spend.json", 0.003, "evaluation")
    trace = MeteredTrace(Trace(), ledger)

    with trace.generation(call()) as record:
        record.usage(GenerationUsage(1000, 500, 0))

    with pytest.raises(SpendCapReached), trace.generation(call()):
        pass


def test_unpriced_models_are_never_metered_silently(tmp_path):
    ledger = SpendLedger(tmp_path / "spend.json", 1.0, "evaluation")

    with pytest.raises(SpendCapReached, match="No price"):
        ledger.admit(call(model="unknown-model"))


def test_usage_still_reaches_the_real_trace(tmp_path):
    inner = Trace()
    trace = MeteredTrace(inner, SpendLedger(tmp_path / "spend.json", 1.0, "x"))
    usage = GenerationUsage(10, 5, 0)

    with trace.generation(call()) as record:
        record.usage(usage)

    inner.record.usage.assert_called_once_with(usage)
