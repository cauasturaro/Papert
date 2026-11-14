"""JSON log lines for the service entry points: correlation ids and error classes only.

Exception messages are never written. Provider, validation and database messages can echo
learner input, so a failure is described by the class names along its cause chain and the
code locations of its innermost traceback.
"""

import json
import logging
import sys
import traceback
from pathlib import Path

# Extra fields copied into the line; values must be identifiers, counts or our own enums.
CORRELATION_FIELDS = ("executionId", "messageId", "receiveCount", "operation")
MAX_CHAIN = 5
MAX_FRAMES = 12


def error_details(error: BaseException) -> dict:
    chain = []
    current: BaseException | None = error
    innermost = error

    while current is not None and len(chain) < MAX_CHAIN:
        chain.append(type(current).__name__)
        innermost = current
        current = current.__cause__ or current.__context__

    frames = traceback.extract_tb(innermost.__traceback__)[-MAX_FRAMES:]
    stack = [f"{Path(frame.filename).name}:{frame.lineno}:{frame.name}" for frame in frames]

    return {"error": chain[0], "causes": chain[1:], "stack": stack}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "level": record.levelname,
            "service": "seymour",
            "logger": record.name,
            # Messages are event names chosen in code, never interpolated content.
            "event": record.msg if isinstance(record.msg, str) else "unknown",
        }

        for key in CORRELATION_FIELDS:
            if hasattr(record, key):
                entry[key] = getattr(record, key)

        if record.exc_info and record.exc_info[1] is not None:
            entry.update(error_details(record.exc_info[1]))

        return json.dumps(entry)


def configure_logging(level: int = logging.INFO) -> None:
    """Replaces the root handlers: Lambda's default handler would print raw tracebacks."""
    root = logging.getLogger()

    if any(isinstance(handler.formatter, JsonFormatter) for handler in root.handlers):
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root.handlers = [handler]
    root.setLevel(level)
    # Request URLs are safe but would log every model and control call at INFO.
    logging.getLogger("httpx").setLevel(logging.WARNING)
