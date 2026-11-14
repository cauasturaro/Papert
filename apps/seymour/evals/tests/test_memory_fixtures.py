"""Offline checks that the tutor-memory datasets load and can measure what they claim."""

import json
import re
from pathlib import Path

import pytest

from src.tutor.domain.context import Turn, TutorContext
from src.tutor.domain.memory import Note

pytestmark = pytest.mark.unit

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "memory"
DATASETS = {
    name: json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    for name in ("proposals", "preference_use", "long_conversation")
}
PROPOSALS = DATASETS["proposals"]["cases"]
PREFERENCES = DATASETS["preference_use"]["cases"]
CONVERSATION = DATASETS["long_conversation"]


def probe(probe_id):
    return next(probe for probe in CONVERSATION["probes"] if probe["id"] == probe_id)


@pytest.mark.parametrize("dataset", DATASETS.values(), ids=DATASETS.keys())
def test_every_dataset_builds_a_valid_tutor_context(dataset):
    TutorContext(sessionId="memory-fixture", **dataset["step"])


@pytest.mark.parametrize("cases", [PROPOSALS, PREFERENCES, CONVERSATION["probes"]])
def test_case_ids_are_unique(cases):
    ids = [case["id"] for case in cases]

    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("case", PROPOSALS, ids=lambda case: case["id"])
def test_proposal_labels_match_their_scoring_terms(case):
    terms = case["expectedTerms"]

    for turn in case.get("recentTurns", []):
        Turn(**turn)

    assert case["expected"] in {"preference", "difficulty", "none"}

    if case["expected"] == "none":
        assert terms == []
    else:
        assert terms
        assert all(term == term.lower() for term in terms)


@pytest.mark.parametrize("case", PREFERENCES, ids=lambda case: case["id"])
def test_preference_cases_carry_valid_notes_and_checks(case):
    notes = [Note(**memory) for memory in case["memory"]]

    assert bool(notes) is not case["control"]
    re.compile(case["check"]["pattern"], re.IGNORECASE)


def test_each_control_matches_one_case_with_memory():
    active = [case for case in PREFERENCES if not case["control"]]
    controls = [case for case in PREFERENCES if case["control"]]

    for control in controls:
        matches = [case for case in active if case["prompt"] == control["prompt"]]

        assert len(matches) == 1
        assert control["check"] == matches[0]["check"]


def test_pending_actions_appear_only_in_turns_that_get_folded():
    for turn in CONVERSATION["turns"]:
        Turn(**turn)

    early = CONVERSATION["turns"][:8]
    later = CONVERSATION["turns"][8:]
    early_text = "\n".join(f"{turn['prompt']}\n{turn['answer']}" for turn in early).lower()
    later_text = "\n".join(f"{turn['prompt']}\n{turn['answer']}" for turn in later).lower()

    for alternatives in probe("pending-actions")["expectAny"]:
        for alternative in alternatives:
            assert alternative in early_text
            assert alternative not in later_text
