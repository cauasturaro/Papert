"""Operational time budget for document parsers."""

import time

from src.domain.errors import IngestionFailure

EXTRACTION_SECONDS = 60


def _check_deadline(started):
    if time.monotonic() - started > EXTRACTION_SECONDS:
        raise IngestionFailure("too_large")
