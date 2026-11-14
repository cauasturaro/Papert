import json
import os
from collections.abc import Iterable
from pathlib import Path

from evals.gate import content_hash
from evals.spend import MeteredTrace, SpendLedger
from src.shared.domain.inference import ModelTask
from src.shared.infrastructure.generation import GenerationCall, GenerationUsage
from src.shared.infrastructure.models import model_name, provider_model, settings_from_env
from src.shared.infrastructure.openai_embeddings import OpenAIEmbeddings
from src.shared.infrastructure.tracing import ExecutionTrace


def select_cases(cases: list[dict], selected: Iterable[str], split: str = "all") -> list[dict]:
    requested = set(selected)
    known = {case["id"] for case in cases}
    unknown = requested - known
    if unknown:
        raise ValueError(f"Unknown case IDs: {', '.join(sorted(unknown))}")

    chosen = [
        case
        for case in cases
        if (not requested or case["id"] in requested) and split in {"all", case.get("split")}
    ]
    if not chosen:
        raise ValueError("No evaluation cases selected")

    return chosen


def parse_run_count(value: str) -> int:
    runs = int(value)
    if runs < 1:
        raise ValueError("Run count must be positive")

    return runs


def write_report(output: str | None, report: dict) -> None:
    if output:
        Path(output).write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )


class Runtime:
    def __init__(self, suite: str, tools=()):
        self.suite = suite
        self.settings = settings_from_env()
        self.provider = os.environ.get("EVAL_PROVIDER", self.settings.provider)
        self.model_name = model_name(self.provider, self.settings)
        self.ledger = SpendLedger.from_env(suite)
        self.trace = MeteredTrace(ExecutionTrace(tools), self.ledger)

    def model(self, task: ModelTask):
        return provider_model(self.provider, task, self.settings, self.trace)

    def identity(self, dataset: object, task: ModelTask | None = None) -> dict:
        identity = {
            "suite": self.suite,
            "provider": self.provider,
            "model": self.model_name,
            "dataset_hash": content_hash(dataset),
        }
        if task is not None:
            identity.update(prompt=task.prompt.id, prompt_version=task.prompt.version)

        return identity

    def embeddings(self, *, timeout: float = 15):
        if self.settings.provider == "fake":
            from src.shared.infrastructure.fake_embedder import FakeEmbedder

            return FakeEmbedder()

        return MeteredEmbeddings(self.ledger, timeout=timeout)


class MeteredEmbeddings(OpenAIEmbeddings):
    def __init__(self, ledger: SpendLedger | None, client=None, model=None, *, timeout: float = 15):
        super().__init__(client, model, timeout=timeout)
        self.ledger = ledger

    def embed_many(self, texts: list[str]) -> tuple[list[list[float]], int]:
        estimate = sum(self.count_tokens(text) for text in texts)
        call = GenerationCall("openai", self.model, "embedding", estimate, True, 0, "embedding", "")
        usage = GenerationUsage(estimate, 0, 0)
        if self.ledger is not None:
            self.ledger.admit(call)

        try:
            vectors, tokens = super().embed_many(texts)
            usage = GenerationUsage(tokens, 0, 0)
        finally:
            # A lost response may still be billed; retain the admitted charge.
            if self.ledger is not None:
                self.ledger.record(call, usage)

        return vectors, tokens

    def embed(self, query: str) -> tuple[list[float], int]:
        vectors, tokens = self.embed_many([query])

        return vectors[0], tokens
