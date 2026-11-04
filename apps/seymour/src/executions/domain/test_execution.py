import pytest

from src.executions.domain.execution import Claim

pytestmark = pytest.mark.unit


def test_claims_route_generation_only_with_its_budget():
    snapshot = {"kind": "generation"}

    assert Claim("running", "lease", snapshot, 16000).workflow() == "generation"

    with pytest.raises(ValueError):
        Claim("running", "lease", snapshot, 8000).workflow()
