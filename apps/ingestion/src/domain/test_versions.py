import pytest

from src.domain.versions import (
    ObjectVersion,
    StoredVersion,
    clear_allowed,
    compare_sequencers,
    write_decision,
)

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("stored", "incoming", "replace", "expected"),
    [
        (None, ObjectVersion("v1", "A1"), False, "write"),
        (StoredVersion(None, None, False, False), ObjectVersion("v1", "A1"), False, "write"),
        (StoredVersion("v1", "A1", True, True), ObjectVersion("v2", "B2"), True, "deleted"),
        (StoredVersion("v2", "B2", False, True), ObjectVersion("v1", "A1"), True, "stale"),
        (StoredVersion("v1", "A1", False, True), ObjectVersion("v2", "A1"), True, "stale"),
        (StoredVersion("v1", "A1", False, True), ObjectVersion("v1", "a1"), False, "duplicate"),
        (StoredVersion("v1", "A1", False, True), ObjectVersion("v1", "A1"), True, "write"),
        (StoredVersion("v1", "A1", False, False), ObjectVersion("v1", "A1"), False, "write"),
        (StoredVersion("v1", "A1", False, True), ObjectVersion("v2", "B2"), False, "write"),
    ],
)
def test_write_decision(stored, incoming, replace, expected):
    decision = write_decision(stored, incoming, replace)

    assert decision == expected


@pytest.mark.parametrize(
    ("left", "right", "expected"),
    [("a", "A0", 0), ("A", "A1", -1), ("A1", "A", 1), ("F", "10", 1)],
)
def test_sequencers_are_uppercased_and_right_padded(left, right, expected):
    order = compare_sequencers(left, right)

    assert order == expected


@pytest.mark.parametrize(
    ("stored", "incoming", "expected"),
    [
        (None, ObjectVersion("v1", "A1"), True),
        (StoredVersion(None, None, False, False), ObjectVersion("v1", "A1"), True),
        (StoredVersion("v1", "A1", True, True), ObjectVersion("v2", "B2"), False),
        (StoredVersion("v2", "B2", False, True), ObjectVersion("v1", "A1"), False),
        (StoredVersion("v1", "A1", False, True), ObjectVersion("v2", "A1"), True),
        (StoredVersion("v1", "A1", False, True), ObjectVersion("v2", "B2"), True),
    ],
)
def test_clear_allowed_preserves_equal_sequencers_with_other_version_ids(
    stored, incoming, expected
):
    allowed = clear_allowed(stored, incoming)

    assert allowed is expected
