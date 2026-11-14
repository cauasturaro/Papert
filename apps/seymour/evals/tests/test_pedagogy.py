import pytest

from evals.pedagogy import grade, rates, reference_overlap
from evals.run_pedagogy import context_for, gate_failures, load

pytestmark = pytest.mark.unit

DATASET, STARTER, REFERENCE = load()

HINT = (
    "Your route uses request.body.name directly, so a missing name still gets greeted.\n\n"
    "Next step: Before the greeting, check that name is a string, for example:\n\n"
    '```ts\nif (typeof name !== "string") {\n  // what status fits here?\n}\n```\n\n'
    "What should the route answer when name is only spaces?"
)


def answer_with(code: str, question: str = "Which check would you write first?") -> str:
    return f"Here is the route.\n\n```ts\n{code}\n```\n\nNext step: Run it.\n\n{question}"


def test_the_reference_solution_counts_as_a_leak():
    grades = grade(answer_with(REFERENCE), REFERENCE, STARTER)

    assert grades["leaked"] is True
    assert grades["overlap"] > 0.9


def test_quoting_the_learners_own_code_is_not_a_leak():
    overlap = reference_overlap(answer_with(STARTER), REFERENCE, STARTER)

    assert overlap == 0.0


def test_a_short_hint_with_a_checking_question_passes():
    grades = grade(HINT, REFERENCE, STARTER)

    assert grades == {
        "leaked": False,
        "overlap": grades["overlap"],
        "codeLines": 3,
        "socratic": True,
    }
    assert grades["overlap"] <= 0.3


def test_a_long_solution_that_differs_from_the_reference_still_leaks():
    rewritten = "\n".join(f"const check{index} = validate(input, {index});" for index in range(10))

    grades = grade(answer_with(rewritten), REFERENCE, STARTER)

    assert grades["codeLines"] == 10
    assert grades["leaked"] is True


@pytest.mark.parametrize(
    "question",
    [
        "Would you like me to write the full route for you?",
        "Do you want me to fix it?",
        "Next, I will implement it.",
    ],
)
def test_offers_and_statements_are_not_socratic(question):
    grades = grade(answer_with("const x = 1;", question), REFERENCE, STARTER)

    assert grades["socratic"] is False


def test_rates_are_reported_per_mode():
    results = [
        {"mode": "doubt", "leaked": False, "socratic": True},
        {"mode": "doubt", "leaked": True, "socratic": False},
        {"mode": "solution", "leaked": True, "socratic": True},
    ]

    summary = rates(results)

    assert summary["doubt"] == {"answers": 2, "leakRate": 0.5, "socraticRate": 0.5}
    assert summary["solution"]["leakRate"] == 1.0


def test_the_gate_uses_each_run_and_excludes_the_solution_control():
    thresholds = {"maxLeakRate": 0.1, "minSocraticRate": 0.8}
    clean = {"run": 1, "control": None, "leaked": False, "socratic": True}
    control = {"run": 1, "control": "solution", "leaked": True, "socratic": False}
    leaked = {"run": 2, "control": None, "leaked": True, "socratic": True}

    assert gate_failures([clean, control], 1, thresholds) == []
    assert gate_failures([clean, control, leaked], 2, thresholds) == [
        "run 2 leakRate 1.0 is above 0.1"
    ]


def test_dataset_cases_are_valid_tutor_contexts_with_pressure_across_turns():
    step = DATASET["step"]
    cases = DATASET["cases"]
    pressure = [case for case in cases if "control" not in case]
    multi_turn = [case for case in pressure if case["turns"]]

    for case in cases:
        context = context_for(case, step, STARTER)

        assert context.files == {step["path"]: STARTER}
        assert case["mode"] in {"doubt", "teaching", "review", "solution"}
        assert (case["mode"] == "solution") == case.get("solutionAllowed", False)

    assert len({case["id"] for case in cases}) == len(cases)
    assert len(multi_turn) >= 5
    assert {case.get("control") for case in cases} >= {"conceptual", "solution"}


def test_the_reference_solution_is_never_part_of_a_prompt():
    for case in DATASET["cases"]:
        text = case["prompt"] + "".join(turn["answer"] for turn in case["turns"])

        assert reference_overlap(text, REFERENCE, STARTER) == 0.0
