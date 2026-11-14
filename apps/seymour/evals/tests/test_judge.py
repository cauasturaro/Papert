import pytest

from evals.judge import JUDGE_PROMPTS, agreement, judge, judge_task

pytestmark = pytest.mark.unit


class FakeModel:
    def __init__(self, content):
        self.content = content

    def complete(self, messages, tools, effort, remaining, deadline, active):
        from src.shared.domain.inference import Message

        return Message(
            role="assistant",
            content=self.content,
            usage={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
        )


ITEM = {"files": {"a.ts": "x"}, "feedback": {"name": "ok"}, "hints": ["Look at a.ts"]}
STEP = {"challenge": {"criteria": [{"id": "name", "description": "d"}]}}


def test_a_valid_verdict_is_parsed_and_invalid_output_is_never_a_pass():
    valid = '{"specific": true, "gives_solution": false, "progression": false, "reason": "r"}'

    verdict, tokens = judge(FakeModel(valid), ITEM, STEP, deadline=1e12)
    invalid, _tokens = judge(FakeModel("not json"), ITEM, STEP, deadline=1e12)

    assert (verdict.specific, verdict.progression, tokens) == (True, False, 15)
    assert verdict.rubric() == {"specific": True, "no_solution": True, "progression": False}
    assert invalid is None


def test_agreement_reports_raw_agreement_and_kappa_per_item():
    labels = [
        {"specific": True, "no_solution": True, "progression": True},
        {"specific": False, "no_solution": True, "progression": False},
        {"specific": True, "no_solution": True, "progression": True},
        {"specific": False, "no_solution": True, "progression": True},
    ]
    verdicts = [
        {"specific": True, "no_solution": True, "progression": True},
        {"specific": False, "no_solution": True, "progression": True},
        {"specific": True, "no_solution": True, "progression": True},
        None,
    ]

    report = agreement(labels, verdicts)

    assert report["specific"] == {"pairs": 3, "agreement": 1.0, "kappa": 1.0}
    assert report["progression"]["agreement"] == pytest.approx(0.667)
    # Every pair is "true" on both sides: chance agreement is total, kappa is undefined.
    assert report["no_solution"]["kappa"] is None


def test_the_judge_has_its_own_versioned_prompt_and_strict_schema():
    task = judge_task()

    assert task.prompt is JUDGE_PROMPTS
    assert JUDGE_PROMPTS.version.startswith("sha:")
    assert set(task.schema["required"]) == {"specific", "gives_solution", "progression", "reason"}
