import subprocess
import sys

import pytest

from src.domain.errors import IngestionFailure
from src.infrastructure.extraction.doc import _piece_table

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    "clx", [b"\x01", b"\x01\xfd\xff", b"\x01\x01\x00", b"\x02", b"\x02\xff\xff\xff\xff"]
)
def test_truncated_piece_tables_are_typed_failures(clx):
    with pytest.raises(IngestionFailure) as failure:
        _piece_table(clx)

    assert failure.value.code == "corrupt_file"


def test_arbitrary_piece_tables_terminate_with_typed_errors():
    # A subprocess timeout also catches regressions that stop making forward progress.
    program = """
import random
from src.domain.errors import IngestionFailure
from src.infrastructure.extraction.doc import _piece_table
rng = random.Random(42)
for data in [b"\\x01\\xfd\\xff"] + [rng.randbytes(size) for size in range(1024)]:
    try:
        _piece_table(data)
    except IngestionFailure as error:
        assert error.code == "corrupt_file"
"""
    result = subprocess.run([sys.executable, "-c", program], timeout=3, capture_output=True)

    assert result.returncode == 0, result.stderr.decode()
