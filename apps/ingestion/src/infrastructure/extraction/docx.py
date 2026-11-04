"""Extract paragraphs, headings and tables from DOCX."""

import io
import time
import zipfile

from src.domain.errors import IngestionFailure
from src.domain.extraction.common import (
    MAX_ZIP_UNCOMPRESSED,
    Block,
    Extracted,
    _check_text_limit,
    _clean,
)
from src.infrastructure.extraction.support import _check_deadline


def _docx_heading(paragraph):
    style = paragraph.style.name if paragraph.style is not None else ""

    return style.startswith("Heading") or style == "Title"


def extract_docx(data):
    import docx
    from docx.table import Table

    started = time.monotonic()

    # Bound decompression before handing the archive to the XML parser.
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        uncompressed = sum(item.file_size for item in archive.infolist())

    if uncompressed > MAX_ZIP_UNCOMPRESSED:
        raise IngestionFailure("too_large")

    try:
        document = docx.Document(io.BytesIO(data))
        items = list(document.iter_inner_content())
    except Exception:
        raise IngestionFailure("corrupt_file") from None

    blocks = []
    heading = None

    for index, item in enumerate(items):
        _check_deadline(started)

        if isinstance(item, Table):
            rows = [" | ".join(cell.text.strip() for cell in row.cells) for row in item.rows]
            text = _clean("\n".join(rows))
        else:
            text = _clean(item.text)

            if text and _docx_heading(item):
                heading = text

        if not text:
            continue

        location = {"paragraphStart": index + 1, "paragraphEnd": index + 1, "heading": heading}
        blocks.append(Block(text, location))
        _check_text_limit(blocks)

    if not blocks:
        raise IngestionFailure("no_text")

    return Extracted(blocks)
