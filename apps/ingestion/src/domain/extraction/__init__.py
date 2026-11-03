"""Extract located text blocks from verified PDF, DOC, DOCX and Markdown bytes."""

import io
import zipfile

import olefile

from src.domain.errors import IngestionFailure
from src.domain.extraction.common import Block as Block
from src.domain.extraction.common import Extracted as Extracted
from src.domain.extraction.doc import extract_doc
from src.domain.extraction.docx import extract_docx
from src.domain.extraction.markdown import extract_markdown
from src.domain.extraction.pdf import extract_pdf

OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def _ole_streams(data):
    try:
        with olefile.OleFileIO(io.BytesIO(data)) as ole:
            return {"/".join(entry) for entry in ole.listdir()}
    except Exception:
        raise IngestionFailure("corrupt_file") from None


def _is_docx(data):
    if not data.startswith(b"PK"):
        return False

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = set(archive.namelist())
    except zipfile.BadZipFile:
        return False

    return "word/document.xml" in names and "[Content_Types].xml" in names


def sniff(data):
    """Returns the format the bytes actually contain, or None when unrecognized."""
    if data[:1024].lstrip(b"\xef\xbb\xbf\x00\t\n\r ").startswith(b"%PDF-"):
        return "pdf"

    if data.startswith(OLE_MAGIC):
        streams = _ole_streams(data)

        # Encrypted OOXML packages are OLE containers holding the encrypted part.
        if "EncryptedPackage" in streams:
            return "encrypted"

        if "WordDocument" in streams:
            return "doc"

        return None

    if _is_docx(data):
        return "docx"

    if b"\x00" not in data[:8192]:
        try:
            data.decode("utf-8-sig")
        except UnicodeDecodeError:
            return None

        return "md"

    return None


EXTRACTORS = {
    "pdf": extract_pdf,
    "doc": extract_doc,
    "docx": extract_docx,
    "md": extract_markdown,
}


def extract(declared_format, data):
    actual = sniff(data)

    if actual == "encrypted":
        raise IngestionFailure("encrypted")

    if actual is None:
        raise IngestionFailure("corrupt_file")

    if actual != declared_format:
        raise IngestionFailure("content_mismatch")

    return EXTRACTORS[declared_format](data)
