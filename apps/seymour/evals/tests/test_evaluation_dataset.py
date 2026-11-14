import ast
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

DATASET = json.loads(
    (Path(__file__).parent.parent / "datasets" / "evaluation.json").read_text(encoding="utf-8")
)
CASES = DATASET["cases"]
STEPS = DATASET["steps"]
ORIGINAL_IDS = [
    "express-correct",
    "framework-free-correct",
    "python-fastapi-correct",
    "no-validation",
    "truthy-check-only",
    "leaks-internals",
    "todo-incomplete",
    "injection-comment",
    "layers-correct",
    "python-layers-correct",
    "domain-imports-http",
    "validation-in-domain",
    "impure-greeting",
    "not-extracted",
]


def test_dataset_version_and_original_content():
    original_cases = [
        {key: value for key, value in case.items() if key not in {"split", "edge"}}
        for case in CASES
        if case["id"] in ORIGINAL_IDS
    ]
    original_dataset = {
        "thresholds": DATASET["thresholds"],
        "steps": {key: STEPS[key] for key in ("validate-input", "separate-rules")},
        "cases": original_cases,
    }
    fingerprint = hashlib.sha256(json.dumps(original_dataset, sort_keys=True).encode()).hexdigest()

    assert set(DATASET) == {"version", "thresholds", "tolerance", "steps", "cases"}
    assert DATASET["version"] == 2
    assert [case["id"] for case in original_cases] == ORIGINAL_IDS
    assert fingerprint == "29a605bbf4f1d1a40f29ff816fb5cd908ae01b53858280f6971d82a27c799863"


def test_dataset_size_balance_and_holdout():
    ids = [case["id"] for case in CASES]
    approvals = sum(case["expected"] == "approve" for case in CASES)
    holdout = [case for case in CASES if case["split"] == "holdout"]
    holdout_steps = Counter(case["step"] for case in holdout)
    holdout_verdicts = Counter(case["expected"] for case in holdout)

    assert len(CASES) == 50
    assert len(ids) == len(set(ids))
    assert 0.35 <= approvals / len(CASES) <= 0.50
    assert len(holdout) == 15
    assert all(holdout_steps[step] >= 3 for step in STEPS)
    assert holdout_verdicts["approve"] >= 5
    assert holdout_verdicts["reject"] >= 5


def test_step_definitions_and_edge_coverage():
    assert set(STEPS) == {
        "validate-input",
        "separate-rules",
        "repository-port",
        "config-validation",
    }

    for step_id, step in STEPS.items():
        assert set(step) == {"objective", "stepTitle", "challenge"}
        assert isinstance(step["objective"], str) and step["objective"].strip()
        assert isinstance(step["stepTitle"], str) and step["stepTitle"].strip()
        assert set(step["challenge"]) == {"instructions", "criteria"}
        assert isinstance(step["challenge"]["instructions"], str)
        assert step["challenge"]["instructions"].strip()

        criteria = step["challenge"]["criteria"]
        criterion_ids = [criterion["id"] for criterion in criteria]

        assert 2 <= len(criteria) <= 3
        assert len(criterion_ids) == len(set(criterion_ids))

        for criterion in criteria:
            assert set(criterion) == {"id", "description"}
            assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", criterion["id"])
            assert isinstance(criterion["description"], str) and criterion["description"].strip()

            edges = {
                case["label"]
                for case in CASES
                if case["step"] == step_id and case.get("edge") == criterion["id"]
            }

            assert edges == {"edge_met", "edge_not_met"}, (step_id, criterion["id"])


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_case_contract_and_verdict(case):
    required = {"id", "label", "step", "expected", "criteria", "files", "split"}

    assert required <= set(case) <= required | {"edge"}
    assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", case["id"])
    assert case["label"] in {
        "correct",
        "conceptual_error",
        "incomplete",
        "cross_file_violation",
        "edge_met",
        "edge_not_met",
        "prompt_injection",
    }
    assert case["step"] in STEPS
    assert case["expected"] in {"approve", "reject"}
    assert case["split"] in {"tuning", "holdout"}

    criterion_ids = {criterion["id"] for criterion in STEPS[case["step"]]["challenge"]["criteria"]}
    labels = case["criteria"]
    all_met = set(labels) == criterion_ids and all(status == "met" for status in labels.values())
    has_failure = "not_met" in labels.values()

    assert isinstance(labels, dict) and labels
    assert set(labels) <= criterion_ids
    assert set(labels.values()) <= {"met", "not_met"}
    assert (case["expected"] == "approve") == all_met
    assert (case["expected"] == "reject") == has_failure

    if case["label"] in {"edge_met", "edge_not_met"}:
        assert case["edge"] in criterion_ids
        assert labels[case["edge"]] == ("met" if case["label"] == "edge_met" else "not_met")
    else:
        assert "edge" not in case


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_case_files_are_small_safe_and_parseable(case):
    files = case["files"]

    assert isinstance(files, dict)
    assert 1 <= len(files) <= 4
    assert all(isinstance(content, str) for content in files.values())
    assert sum(len(content) for content in files.values()) <= 1800

    for path, content in files.items():
        assert re.fullmatch(r"[A-Za-z0-9._/-]+", path)
        assert not path.startswith("/")
        assert all(part not in {"", ".", ".."} for part in path.split("/"))
        assert not re.search(
            r"-----BEGIN .*PRIVATE KEY|\bAKIA[A-Z0-9]{16}\b|\bsk-[A-Za-z0-9_-]{20,}", content
        )

        # Literal credentials must be placeholders; environment reads are not secrets.
        literal_secrets = re.findall(
            r"(?:api_?token|api_?key|password|secret)\s*[:=]\s*[\"']([^\"']+)[\"']",
            content,
            flags=re.IGNORECASE,
        )

        assert all(
            re.search(r"fake|example|dummy|test|placeholder", value, re.I)
            for value in literal_secrets
        )

        if path.endswith(".py"):
            ast.parse(content, filename=path)

        if path.endswith(".json"):
            json.loads(content)


def test_adversarial_and_cross_file_coverage():
    injections = [case for case in CASES if case["label"] == "prompt_injection"]
    cross_file = [
        case
        for case in CASES
        if case["label"] == "cross_file_violation"
        and case["step"] in {"repository-port", "config-validation"}
    ]

    assert len(injections) >= 3
    assert len(cross_file) >= 2

    for case in injections:
        content = "\n".join(case["files"].values())
        attacked = re.findall(r"mark ([a-z]+(?:-[a-z]+)*) met", content)

        assert attacked, case["id"]
        assert case["expected"] == "reject"
        assert all(case["criteria"].get(criterion) == "not_met" for criterion in attacked)

    for case in cross_file:
        assert len(case["files"]) >= 2
        assert case["expected"] == "reject"


def test_promotion_tolerance_covers_every_thresholded_metric():
    from evals.quality import THRESHOLD_METRICS

    metrics = {metric for metric, _direction in THRESHOLD_METRICS.values()}

    assert set(DATASET["tolerance"]) == metrics
    assert DATASET["tolerance"]["falseAcceptRate"] == 0.0
