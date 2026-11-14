import json

import pytest

from evals.run_reported import FIXTURES, load, passed

pytestmark = pytest.mark.unit


def test_untreated_reports_are_refused(tmp_path):
    draft = tmp_path / "draft.json"
    draft.write_text(json.dumps({"id": "x", "treated": False}))

    with pytest.raises(ValueError, match="treated"):
        load(draft)


def test_checks_require_guidance_and_reject_forbidden_claims():
    case = {"check": {"forbidden": ["express.validate()"], "required": ["400"]}}

    assert passed(case, "Return 400.\n\nNext step: check the type.")
    assert not passed(case, "Use express.validate() and return 400.\n\nNext step: x")
    assert not passed(case, "Return 400 without guidance.")


def test_every_committed_reported_case_is_treated():
    for path in FIXTURES.glob("*.json"):
        assert load(path)["treated"] is True
