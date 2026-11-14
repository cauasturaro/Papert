import json
import re
from collections import Counter
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

EVALS = Path(__file__).resolve().parent.parent
DATASET = json.loads((EVALS / "datasets" / "recommendation.json").read_text(encoding="utf-8"))
CASES = DATASET["cases"]

# Mirrors showcase-roadmaps.ts plus the default roadmap.
CATALOG_IDS = {
    "hexagonal-architecture-nestjs",
    "rag-fastapi-pgvector",
    "docker-ci-cd-production",
    "postgresql-schema-design",
    "typescript-rest-api-express",
    "python-testing-pytest",
    "react-data-fetching-tanstack-query",
    "event-driven-aws-sqs-lambda",
    "http-service-foundations",
}
CATEGORY_MINIMUMS = {
    "paraphrase": 14,
    "multilingual": 4,
    "partial": 6,
    "unrelated": 8,
    "adversarial": 3,
}


def test_dataset_version_and_coverage():
    ids = [case["id"] for case in CASES]
    categories = Counter(case["category"] for case in CASES)
    coverage = Counter(roadmap_id for case in CASES for roadmap_id in case["expected"])
    levels = {case["level"] for case in CASES}

    assert DATASET["version"] == 1
    assert 36 <= len(CASES) <= 44
    assert len(ids) == len(set(ids))
    assert levels == {"beginner", "intermediate", "advanced"}

    for category, minimum in CATEGORY_MINIMUMS.items():
        assert categories[category] >= minimum, category

    for roadmap_id in CATALOG_IDS:
        assert coverage[roadmap_id] >= 2, roadmap_id


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_case_contract(case):
    expected = case["expected"]

    assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", case["id"])
    assert case["category"] in CATEGORY_MINIMUMS
    assert case["level"] in {"beginner", "intermediate", "advanced"}
    assert isinstance(case["goal"], str)
    assert 10 <= len(case["goal"]) <= 500
    assert isinstance(expected, list)
    assert all(isinstance(roadmap_id, str) for roadmap_id in expected)
    assert len(expected) == len(set(expected))
    assert set(expected) <= CATALOG_IDS
    assert len(expected) <= 3

    if case["category"] == "unrelated":
        assert expected == []

    if case["category"] == "multilingual":
        assert len(expected) == 1

    if case["category"] in {"paraphrase", "partial"}:
        assert 1 <= len(expected) <= 2
