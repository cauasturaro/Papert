import pytest

from src.shared.domain.inference import BudgetExceeded, ModelTask, fitted_output
from src.shared.domain.prompts import PromptFamily

pytestmark = pytest.mark.unit

PROMPT = PromptFamily("test", {"system": "You are a test."})


def task(minimum_output=None):
    return ModelTask("test", {}, PROMPT, minimum_output=minimum_output)


def test_the_full_reservation_is_kept_when_it_fits():
    assert fitted_output(2048, 2000, 8000, task(1024)) == 2048


def test_the_reservation_shrinks_to_the_remaining_budget_down_to_the_floor():
    assert fitted_output(2048, 2200, 3940, task(1024)) == 1740


def test_a_reservation_below_the_floor_exceeds_the_budget():
    with pytest.raises(BudgetExceeded):
        fitted_output(2048, 3000, 3940, task(1024))


def test_a_task_without_a_floor_never_shrinks_its_reservation():
    with pytest.raises(BudgetExceeded):
        fitted_output(2048, 2200, 3940, task())
