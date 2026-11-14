import pytest

from src.domain.index_format import DIMENSIONS, PIPELINE_REVISION

pytestmark = pytest.mark.unit


def test_persisted_index_format():
    assert (DIMENSIONS, PIPELINE_REVISION) == (1536, "2")
