import pytest

from src.evaluation.application.evaluator import EVALUATION_PROMPTS
from src.roadmap.application.prompts import ROADMAP_PROMPTS
from src.shared.domain.prompts import PromptFamily
from src.tutor.application.prompts import TUTOR_PROMPTS
from src.tutor.application.summary import SUMMARY_PROMPTS

pytestmark = pytest.mark.unit


def test_version_is_a_short_content_hash():
    family = PromptFamily("tutor.guidance", {"base": "Be concise."})

    assert family.version.startswith("sha:")
    assert len(family.version) == len("sha:") + 12


def test_changing_any_template_changes_the_version():
    original = PromptFamily("tutor.guidance", {"base": "Be concise.", "mode": "Mode: {mode}."})
    edited = PromptFamily("tutor.guidance", {"base": "Be concise!", "mode": "Mode: {mode}."})
    renamed = PromptFamily("tutor.guidance", {"rules": "Be concise.", "mode": "Mode: {mode}."})
    extended = PromptFamily(
        "tutor.guidance",
        {"base": "Be concise.", "mode": "Mode: {mode}.", "extra": ""},
    )

    versions = {original.version, edited.version, renamed.version, extended.version}

    assert len(versions) == 4


def test_template_order_does_not_change_the_version():
    first = PromptFamily("evaluation.attempt", {"system": "a", "repair": "b"})
    second = PromptFamily("evaluation.attempt", {"repair": "b", "system": "a"})

    assert first.version == second.version


def test_every_seymour_prompt_family_has_a_distinct_stable_id():
    families = [TUTOR_PROMPTS, SUMMARY_PROMPTS, EVALUATION_PROMPTS, ROADMAP_PROMPTS]

    ids = [family.id for family in families]

    assert ids == ["tutor.guidance", "conversation.summary", "evaluation.attempt", "roadmap.draft"]
    assert all(family.templates for family in families)
    assert all("{" not in family.id for family in families)


def test_reordering_the_tutor_layout_changes_its_version():
    from src.tutor.application.prompts import SYSTEM_LAYOUT

    reordered = PromptFamily(
        TUTOR_PROMPTS.id,
        {**TUTOR_PROMPTS.templates, "layout": " ".join(reversed(SYSTEM_LAYOUT))},
    )

    assert reordered.version != TUTOR_PROMPTS.version
