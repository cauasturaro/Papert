"""Extract located text blocks from verified PDF, DOC, DOCX and Markdown bytes."""

import io
import multiprocessing
import time
import zipfile

import olefile

from src.domain.errors import IngestionFailure
from src.domain.extraction.common import Block as Block
from src.domain.extraction.common import Extracted as Extracted
from src.domain.extraction.markdown import extract_markdown
from src.infrastructure.extraction.doc import extract_doc
from src.infrastructure.extraction.docx import extract_docx
from src.infrastructure.extraction.pdf import extract_pdf
from src.infrastructure.extraction.support import EXTRACTION_SECONDS

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


def _extract_in_worker(connection, declared_format, data):
    try:
        connection.send(("ok", extract(declared_format, data)))
    except IngestionFailure as error:
        connection.send(("failure", error.code))
    except Exception:
        connection.send(("failure", "corrupt_file"))
    finally:
        connection.close()


class DocumentExtractor:
    def __init__(self, deadline=None):
        self.deadline = deadline

    def extract(self, declared_format: str, data: bytes) -> Extracted:
        timeout = EXTRACTION_SECONDS
        if self.deadline is not None:
            timeout = min(timeout, self.deadline - time.monotonic())
        if timeout <= 0:
            raise TimeoutError("Invocation budget exhausted before extraction")

        # A separate process bounds even one uninterruptible parser call.
        context = multiprocessing.get_context("spawn")
        reader, writer = context.Pipe(duplex=False)
        process = context.Process(target=_extract_in_worker, args=(writer, declared_format, data))
        try:
            process.start()
            writer.close()
            if not reader.poll(timeout):
                raise TimeoutError("Extraction exceeded its time budget")

            status, result = reader.recv()
            if status == "failure":
                raise IngestionFailure(result)

            return result
        finally:
            if process.pid is not None:
                if process.is_alive():
                    process.terminate()
                process.join()
            reader.close()
            writer.close()
