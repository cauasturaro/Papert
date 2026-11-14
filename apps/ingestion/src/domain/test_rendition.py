import pytest

from src.domain.extraction import Block, Extracted
from src.domain.rendition import rendition, rendition_key

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("format", ["doc", "docx"])
def test_rendition_preserves_block_text_locations_and_order(format):
    extracted = Extracted(
        [
            Block("Ação", {"paragraphStart": 2, "paragraphEnd": 2, "heading": "Título"}),
            Block("  Paragraph\ntext.\n", {"paragraphStart": 4, "paragraphEnd": 5}),
        ],
        warnings=["Extraction warning"],
    )

    expected_body = {
        "version": 1,
        "documentId": "document",
        "versionId": "version",
        "format": format,
        "blocks": [
            {
                "text": "Ação",
                "location": {"paragraphStart": 2, "paragraphEnd": 2, "heading": "Título"},
            },
            {
                "text": "  Paragraph\ntext.\n",
                "location": {"paragraphStart": 4, "paragraphEnd": 5},
            },
        ],
    }

    body = rendition("document", "version", format, extracted)

    assert body == expected_body


@pytest.mark.parametrize("format", ["pdf", "md"])
def test_pdf_and_markdown_have_no_rendition(format):
    extracted = Extracted([Block("Text", {"page": 1})])

    body = rendition("document", "version", format, extracted)

    assert body is None


def test_rendition_key_is_outside_the_source_notification_prefix():
    key = rendition_key("document", "version")

    assert key == "renditions/document/version.json"
