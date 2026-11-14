"""Offline grading of tutor answers: solution leakage and Socratic follow-up.

The checks are deterministic, so they cost nothing and can run on any recorded answer. They
are signals, not proof: a paraphrased solution in prose can pass the leakage check, which is
why the paid judge rubric in `pedagogy_judge.py` grades the same answers.
"""

import re

# Reference-solution token windows; long enough that ordinary syntax does not match by chance.
WINDOW = 6
# Share of the reference windows an answer may repeat before it counts as a leak.
MAX_REFERENCE_OVERLAP = 0.3
# Code lines a hint may show; a longer block is a solution, whatever it contains.
MAX_CODE_LINES = 6

TOKEN = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|\d+|==|!=|===|!==|=>|<=|>=|&&|\|\||\S")
FENCE = re.compile(r"```[^\n]*\n(.*?)```", re.DOTALL)
# Offers to do the work replace the learner's next step instead of checking understanding.
OFFERS = re.compile(
    r"\b(would you like me to|do you want me to|want me to|shall i|should i)\b"
    r".{0,40}\b(write|implement|code|finish|complete|fix|give|paste|show)\b",
    re.IGNORECASE,
)


def tokens(code: str) -> list[str]:
    return TOKEN.findall(code)


def windows(text: str) -> set[tuple[str, ...]]:
    found = tokens(text)

    return {tuple(found[i : i + WINDOW]) for i in range(len(found) - WINDOW + 1)}


def reference_overlap(answer: str, reference: str, starter: str = "") -> float:
    """Share of the solution's new token windows (absent from the learner's starting code) that
    the answer repeats; quoting the learner's own code back is not a leak."""
    solution = windows(reference) - windows(starter)

    if not solution:
        return 0.0

    return round(len(solution & windows(answer)) / len(solution), 3)


def longest_code_block(answer: str) -> int:
    blocks = FENCE.findall(answer)
    lengths = [sum(1 for line in block.splitlines() if line.strip()) for block in blocks]

    return max(lengths, default=0)


def checking_question(answer: str) -> str:
    """The rendered answer ends with the guidance's question paragraph."""
    return answer.strip().split("\n\n")[-1].strip()


def grade(answer: str, reference: str, starter: str = "") -> dict:
    overlap = reference_overlap(answer, reference, starter)
    code_lines = longest_code_block(answer)
    question = checking_question(answer)

    leaked = overlap > MAX_REFERENCE_OVERLAP or code_lines > MAX_CODE_LINES
    socratic = question.endswith("?") and not OFFERS.search(question)

    return {
        "leaked": leaked,
        "overlap": overlap,
        "codeLines": code_lines,
        "socratic": socratic,
    }


def rates(results: list[dict]) -> dict:
    """Leak and Socratic rates per mode; solution mode is the control that may leak."""
    by_mode: dict[str, list[dict]] = {}

    for result in results:
        by_mode.setdefault(result["mode"], []).append(result)

    return {
        mode: {
            "answers": len(rows),
            "leakRate": round(sum(row["leaked"] for row in rows) / len(rows), 3),
            "socraticRate": round(sum(row["socratic"] for row in rows) / len(rows), 3),
        }
        for mode, rows in sorted(by_mode.items())
    }
