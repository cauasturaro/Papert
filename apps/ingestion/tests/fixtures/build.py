"""Regenerates reference fixtures: `.venv/bin/python -m tests.fixtures.build` (DOC comes from textutil)."""

from pathlib import Path

from tests.builders import REFERENCE_MARKDOWN, docx_bytes, pdf_bytes

HERE = Path(__file__).parent

PDF_PAGES = [
    "Dependency inversion\nHigh-level policy does not depend on low-level details.\nBoth depend on abstractions.",
    "Ports and adapters\nA port is an interface owned by the application.\nAn adapter implements it for a technology.",
]

DOCX_PARAGRAPHS = [
    "A bounded context owns its model and language.",
    "Context maps describe relationships between bounded contexts.",
]


def main():
    (HERE / "reference.pdf").write_bytes(pdf_bytes(PDF_PAGES))
    (HERE / "reference.docx").write_bytes(docx_bytes("Domain-Driven Design", DOCX_PARAGRAPHS))
    (HERE / "reference.md").write_text(REFERENCE_MARKDOWN, encoding="utf-8")
    (HERE / "scanned.pdf").write_bytes(pdf_bytes([None]))
    (HERE / "corrupt.pdf").write_bytes(pdf_bytes(PDF_PAGES)[:200])


if __name__ == "__main__":
    main()
