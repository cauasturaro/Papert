import pytest

from src.shared.infrastructure.provider_response import MISSING, validated_usage

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("total", [None, True, -1, 4])
def test_present_total_usage_must_be_a_consistent_integer(total):
    with pytest.raises(RuntimeError, match="Inconsistent model usage"):
        validated_usage(1, 2, 0, total, 10, 20)


def test_absent_total_is_allowed_for_providers_without_it():
    usage = validated_usage(1, 2, 0, MISSING, 10, 20)

    assert usage.input == 1
    assert usage.output == 2
