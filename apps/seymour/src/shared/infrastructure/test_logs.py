import json
import logging
import sys

import pytest

from src.shared.infrastructure.logs import JsonFormatter, error_details

pytestmark = pytest.mark.unit


def failing_with_cause():
    try:
        raise ValueError("learner said: my password is hunter2")
    except ValueError as cause:
        raise RuntimeError("wrapped learner text") from cause


def test_error_details_name_the_cause_chain_without_messages():
    try:
        failing_with_cause()
    except RuntimeError as error:
        details = error_details(error)

    assert details["error"] == "RuntimeError"
    assert details["causes"] == ["ValueError"]
    assert details["stack"][-1].startswith("test_logs.py:")
    assert "hunter2" not in json.dumps(details)


def test_formatter_writes_correlation_fields_and_no_exception_text():
    try:
        failing_with_cause()
    except RuntimeError:
        record = logging.getLogger("test").makeRecord(
            "test",
            logging.ERROR,
            __file__,
            1,
            "execution_failed",
            (),
            exc_info=sys.exc_info(),
            extra={"executionId": "e-1", "messageId": "m-1", "learnerText": "secret"},
        )

    line = JsonFormatter().format(record)
    entry = json.loads(line)

    assert entry["event"] == "execution_failed"
    assert entry["executionId"] == "e-1"
    assert entry["messageId"] == "m-1"
    assert entry["error"] == "RuntimeError"
    assert "learnerText" not in entry
    assert "hunter2" not in line
    assert "wrapped learner text" not in line
