from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from src.executions.application.recommendation_workflow import run_recommendation_job
from src.executions.application.resources import RecommendationResources

pytestmark = pytest.mark.unit


class Trace:
    def __init__(self):
        self.metadata = {}

    @contextmanager
    def execution(self, execution_id, session_id, name="seymour-tutor"):
        trace = self

        class Span:
            def record_metadata(self, metadata):
                trace.metadata = metadata

        yield Span()


class Embedder:
    model = "fake-embedding"

    def count_tokens(self, text):
        return 6

    def embed_many(self, texts):
        return [[1.0, 0.0] for _ in texts], 6 * len(texts)


class Cache:
    def get(self, keys, model):
        return {}

    def put(self, entries, model):
        pass


CONTEXT = {
    "kind": "recommendation",
    "requestKey": "key",
    "sessionId": "session",
    "goal": "I want to learn ports and adapters in NestJS",
    "level": "intermediate",
    "candidates": [
        {
            "roadmapId": "hexagonal-architecture-nestjs",
            "title": "Hexagonal Architecture with NestJS",
            "description": "Ports and adapters.",
            "level": "intermediate",
            "concepts": ["ports"],
            "steps": ["Define ports"],
        }
    ],
}


def test_publishes_matches_and_keeps_text_out_of_traces():
    published = []
    control = MagicMock()
    control.active.return_value = True
    trace = Trace()

    run_recommendation_job(
        "execution",
        "lease",
        CONTEXT,
        8000,
        control,
        published.append,
        lambda: RecommendationResources(Embedder(), Cache(), trace),
    )

    final = published[-1]
    assert final.status == "completed"
    assert final.tokens == 12
    assert final.recommendation == {
        "matches": [{"roadmapId": "hexagonal-architecture-nestjs", "similarity": 1.0}]
    }
    assert "goal" not in trace.metadata
    assert trace.metadata["embedded"] == 1


@pytest.mark.parametrize(("budget", "active"), [(8000, False), (6, True)])
def test_incomplete_check_publishes_no_recommendation(budget, active):
    published = []
    control = MagicMock()
    control.active.return_value = active

    run_recommendation_job(
        "execution",
        "lease",
        CONTEXT,
        budget,
        control,
        published.append,
        lambda: RecommendationResources(Embedder(), Cache(), Trace()),
    )

    assert published[-1].recommendation is None
