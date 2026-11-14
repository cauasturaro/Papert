"""Extract page-located PDF text."""

import io
import time

from src.domain.errors import IngestionFailure
from src.domain.extraction.common import (
    MAX_PAGES,
    Block,
    Extracted,
    _check_text_limit,
    _clean,
)
from src.infrastructure.extraction.support import _check_deadline


def extract_pdf(data):
    from pypdf import PdfReader

    started = time.monotonic()

    try:
        reader = PdfReader(io.BytesIO(data), strict=False)

        if reader.is_encrypted and not reader.decrypt(""):
            raise IngestionFailure("encrypted")

        page_count = len(reader.pages)
    except IngestionFailure:
        raise
    except Exception:
        # pypdf raises many exception types for malformed files.
        raise IngestionFailure("corrupt_file") from None

    if page_count > MAX_PAGES:
        raise IngestionFailure("too_many_pages")

    blocks = []
    empty_pages = 0
    unreadable_pages = 0

    for index, page in enumerate(reader.pages):
        _check_deadline(started)

        try:
            # Layout mode keeps words on their lines; plain mode can emit one word per line.
            text = _clean(page.extract_text(extraction_mode="layout") or "", layout=True)
        except Exception:
            unreadable_pages += 1
            continue

        if not text:
            empty_pages += 1
            continue

        blocks.append(Block(text, {"page": index + 1}))
        _check_text_limit(blocks)

    if not blocks:
        raise IngestionFailure("no_text")

    warnings = []

    if empty_pages:
        warnings.append(f"{empty_pages} page(s) had no extractable text.")

    if unreadable_pages:
        warnings.append(f"{unreadable_pages} page(s) could not be read.")

    return Extracted(blocks, page_count, warnings)
