"""Offline contract checks for the versioned roadmap generation corpus."""

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import pytest

EVALS = Path(__file__).resolve().parents[1] / "evals"
SOURCES = EVALS / "fixtures" / "generation"
DATASET = json.loads((EVALS / "generation.json").read_text(encoding="utf-8"))
CASES = DATASET["cases"]

pytestmark = pytest.mark.unit


def test_dataset_version_and_coverage():
    categories = Counter(case["category"] for case in CASES)
    ids = [case["id"] for case in CASES]
    no_source_levels = defaultdict(set)

    for case in CASES:
        if case["category"] == "no_source":
            no_source_levels[case["goal"]].add(case["level"])

    assert DATASET["version"] == 1
    assert 14 <= len(CASES) <= 16
    assert len(ids) == len(set(ids))
    assert categories["no_source"] >= 6
    assert categories["with_source"] >= 4
    assert categories["unrelated_source"] >= 1
    assert categories["adversarial"] >= 2
    assert len(no_source_levels) >= 6
    assert any({"beginner", "advanced"} <= levels for levels in no_source_levels.values())


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_case_contract(case):
    expectation = case["expect"]

    assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", case["id"])
    assert case["category"] in {"no_source", "with_source", "unrelated_source", "adversarial"}
    assert case["level"] in {"beginner", "intermediate", "advanced"}
    assert isinstance(case["goal"], str)
    assert 10 <= len(case["goal"]) <= 500
    assert len(case["stackTerms"]) >= 2
    assert all(isinstance(term, str) and term.strip() for term in case["stackTerms"])
    assert expectation["sourceUse"] in {"cited", "none", "any"}
    assert isinstance(expectation["levelNotes"], str)
    assert expectation["levelNotes"].strip()
    assert "POST /greetings" in expectation["forbiddenTerms"]

    for field in ("citedSources", "anchors", "forbiddenTerms"):
        assert isinstance(expectation[field], list)
        assert all(isinstance(value, str) and value.strip() for value in expectation[field])


def test_source_fixture_corpus():
    files = sorted(path for path in SOURCES.glob("*.md") if path.name != "README.md")
    assigned_sources = {filename for case in CASES for filename in case["sources"]}

    assert 5 <= len(files) <= 7
    assert {path.name for path in files} == assigned_sources

    for path in files:
        content = path.read_text(encoding="ascii")

        assert 150 <= len(content.split()) <= 600, path.name
        assert content.startswith("# "), path.name


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_case_sources_and_anchors(case):
    expectation = case["expect"]
    source_texts = []

    assert isinstance(case["sources"], list)

    for filename in case["sources"]:
        assert Path(filename).name == filename
        assert filename.endswith(".md")
        assert filename != "README.md"

        path = SOURCES / filename
        assert path.is_file(), filename

        source_texts.append(path.read_text(encoding="ascii"))

    assert set(expectation["citedSources"]) <= set(case["sources"])

    for anchor in expectation["anchors"]:
        assert any(anchor in text for text in source_texts), anchor


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_category_source_rules(case):
    category = case["category"]
    expectation = case["expect"]

    if category == "no_source":
        assert case["sources"] == []
        assert expectation["sourceUse"] == "none"

    if category == "with_source":
        assert case["sources"]
        assert expectation["sourceUse"] == "cited"
        assert expectation["citedSources"]
        assert 2 <= len(expectation["anchors"]) <= 4
        assert len(set(expectation["anchors"])) == len(expectation["anchors"])

    if category == "unrelated_source":
        assert case["sources"]
        assert expectation["sourceUse"] == "none"
