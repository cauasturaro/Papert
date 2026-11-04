import io
from pathlib import Path

import pytest
from pypdf import PdfWriter

from src.domain.errors import IngestionFailure
from src.domain.extraction.common import MAX_PAGES
from src.infrastructure.extraction import extract, sniff
from tests.builders import docx_bytes, pdf_bytes, positioned_pdf_bytes

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return (FIXTURES / name).read_bytes()


def failure_code(declared, data):
    with pytest.raises(IngestionFailure) as raised:
        extract(declared, data)

    return raised.value.code


@pytest.mark.parametrize(
    ("name", "declared", "expected_text", "location_key"),
    [
        ("reference.pdf", "pdf", "An adapter implements it", "page"),
        ("reference.docx", "docx", "Context maps describe", "paragraphStart"),
        ("reference.doc", "doc", "Ação e coração", "paragraphStart"),
        ("reference.md", "md", "Integration tests exercise", "lineStart"),
    ],
)
def test_reference_documents_extract_located_text(name, declared, expected_text, location_key):
    extracted = extract(declared, fixture(name))

    texts = " ".join(block.text for block in extracted.blocks)
    assert expected_text in texts
    assert all(location_key in block.location for block in extracted.blocks)


def test_pdf_pages_and_docx_headings_are_tracked():
    pdf = extract("pdf", fixture("reference.pdf"))
    document = extract("docx", fixture("reference.docx"))

    assert pdf.page_count == 2
    assert [block.location["page"] for block in pdf.blocks] == [1, 2]
    assert document.blocks[-1].location["heading"] == "Domain-Driven Design"


def test_markdown_headings_ignore_fenced_code():
    extracted = extract("md", fixture("reference.md"))

    fenced = extracted.blocks[-1]
    assert fenced.text.startswith("```python")
    assert fenced.location["headings"] == ["Testing strategy", "Integration tests"]


def test_pages_without_text_are_reported_not_invented():
    mixed = pdf_bytes(["Readable page", None])

    extracted = extract("pdf", mixed)

    assert [block.text for block in extracted.blocks] == ["Readable page"]
    assert extracted.warnings == ["1 page(s) had no extractable text."]
    assert failure_code("pdf", fixture("scanned.pdf")) == "no_text"


def test_invalid_files_fail_explicitly():
    docx = fixture("reference.docx")
    zip_without_word = b"PK\x03\x04" + b"\x00" * 64

    assert failure_code("pdf", fixture("corrupt.pdf")) == "corrupt_file"
    assert failure_code("pdf", docx) == "content_mismatch"
    assert failure_code("docx", fixture("reference.doc")) == "content_mismatch"
    assert failure_code("md", fixture("reference.pdf")) == "content_mismatch"
    assert (
        failure_code("doc", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 600) == "corrupt_file"
    )
    assert failure_code("md", "não".encode("latin-1") + b"\xff\xfe") == "corrupt_file"
    assert failure_code("docx", zip_without_word) == "corrupt_file"
    assert failure_code("md", b"\n\n   \n") == "no_text"


def test_encrypted_and_oversized_pdfs_are_rejected():
    writer = PdfWriter()
    writer.add_blank_page(612, 792)
    writer.encrypt("secret")
    encrypted = io.BytesIO()
    writer.write(encrypted)

    many_pages = pdf_bytes(["page"] * (MAX_PAGES + 1))

    assert failure_code("pdf", encrypted.getvalue()) == "encrypted"
    assert failure_code("pdf", many_pages) == "too_many_pages"


def test_text_limit_is_enforced():
    huge = ("word " * 130_000).encode()

    assert failure_code("md", huge) == "too_much_text"


def test_sniff_recognizes_each_format():
    assert sniff(fixture("reference.pdf")) == "pdf"
    assert sniff(fixture("reference.doc")) == "doc"
    assert sniff(docx_bytes("Title", ["Body"])) == "docx"
    assert sniff(b"# Notes") == "md"
    assert sniff(b"\x00\x01binary") is None


def test_pdf_words_placed_separately_stay_on_their_lines_with_json_indentation():
    page = positioned_pdf_bytes(
        [
            (0, "Exemplo de um JSON valido:"),
            (0, "{"),
            (2, '"Operacao": "Adicionar",'),
            (2, '"Codigo_consulta": 778899'),
            (0, "}"),
        ]
    )

    text = extract("pdf", page).blocks[0].text

    assert "Exemplo de um JSON valido:" in text
    assert '\n  "Operacao": "Adicionar",' in text
