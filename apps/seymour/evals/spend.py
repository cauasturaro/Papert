"""Cumulative spend cap for paid eval runs, enforced before every model call.

The ledger file is shared by every eval process of a phase, so separate suites and repeated
runs together never exceed `EVAL_SPEND_CAP_USD`.
"""

import json
import os
import time
from contextlib import contextmanager
from pathlib import Path

from src.shared.infrastructure.generation import GenerationCall, GenerationUsage, cost_details


class SpendCapReached(Exception):
    pass


class SpendLedger:
    def __init__(self, path: Path, cap_usd: float, label: str):
        self.path = path
        self.cap_usd = cap_usd
        self.label = label

    @classmethod
    def from_env(cls, label: str) -> "SpendLedger | None":
        path = os.environ.get("EVAL_SPEND_LEDGER")
        if not path:
            return None

        return cls(Path(path), float(os.environ.get("EVAL_SPEND_CAP_USD", "0.5")), label)

    def spent(self) -> float:
        return self._read()["spentUsd"]

    def admit(self, call: GenerationCall) -> None:
        """Refuses a call whose worst case (full output, no cache) would cross the cap."""
        worst = _usd(call.model, GenerationUsage(call.input_tokens, call.max_output, 0))

        if self.spent() + worst > self.cap_usd:
            raise SpendCapReached(
                f"Spend cap {self.cap_usd} USD reached: {self.spent():.4f} spent, "
                f"next call could cost {worst:.4f}"
            )

    def record(self, call: GenerationCall, usage: GenerationUsage) -> None:
        ledger = self._read()
        usd = _usd(call.model, usage)

        ledger["spentUsd"] = round(ledger["spentUsd"] + usd, 8)
        ledger["calls"] += 1
        ledger["byLabel"][self.label] = round(ledger["byLabel"].get(self.label, 0) + usd, 8)
        ledger["lastAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        self.path.write_text(json.dumps(ledger, indent=2) + "\n")

    def _read(self) -> dict:
        if not self.path.exists():
            return {"capUsd": self.cap_usd, "spentUsd": 0.0, "calls": 0, "byLabel": {}}

        return json.loads(self.path.read_text())


def _usd(model: str, usage: GenerationUsage) -> float:
    cost = cost_details(model, usage)
    if cost is None:
        raise SpendCapReached(f"No price for {model}; refusing an unmetered paid call")

    return cost["input"] + cost["output"]


class MeteredTrace:
    """The real execution trace, with every generation admitted and recorded by the ledger."""

    def __init__(self, trace, ledger: SpendLedger | None):
        self._trace = trace
        self._ledger = ledger
        # Every completed call with its real usage, for cache and latency reports.
        self.usages: list[tuple[GenerationCall, GenerationUsage]] = []

    def __getattr__(self, name):
        return getattr(self._trace, name)

    @contextmanager
    def generation(self, call: GenerationCall):
        if self._ledger is not None:
            self._ledger.admit(call)

        with self._trace.generation(call) as record:
            yield _MeteredRecord(record, call, self)


class _MeteredRecord:
    def __init__(self, record, call, metered: MeteredTrace):
        self._record = record
        self._call = call
        self._metered = metered

    def usage(self, usage: GenerationUsage) -> None:
        self._record.usage(usage)
        self._metered.usages.append((self._call, usage))

        if self._metered._ledger is not None:
            self._metered._ledger.record(self._call, usage)
