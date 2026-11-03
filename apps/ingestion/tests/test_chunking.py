import pytest

from src.domain.chunking import MAX_CHUNKS, OVERLAP_CHARACTERS, TARGET_CHARACTERS, chunk
from src.domain.errors import IngestionFailure
from src.domain.extraction import Block, Extracted


def paragraph(index, words=60):
    return Block(
        " ".join(f"w{index}-{n}" for n in range(words)),
        {"paragraphStart": index, "paragraphEnd": index, "heading": "H"},
    )


def test_offsets_match_document_text_and_chunks_stay_bounded():
    extracted = Extracted([paragraph(index) for index in range(1, 30)])

    chunks = chunk(extracted)
    document = "\n\n".join(block.text for block in extracted.blocks)

    assert len(chunks) > 1
    assert [piece.ordinal for piece in chunks] == list(range(len(chunks)))

    for piece in chunks:
        assert document[piece.char_start : piece.char_end] == piece.content
        assert len(piece.content) <= TARGET_CHARACTERS


def test_consecutive_chunks_overlap_and_merge_locations():
    extracted = Extracted([paragraph(index) for index in range(1, 30)])

    first, second = chunk(extracted)[:2]

    assert second.char_start < first.char_end
    assert first.char_end - second.char_start <= OVERLAP_CHARACTERS
    assert first.location["paragraphStart"] == 1
    assert first.location["paragraphEnd"] > 1


def test_pdf_chunks_never_cross_pages():
    pages = Extracted(
        [Block("alpha " * 50, {"page": 1}), Block("beta " * 50, {"page": 2})], page_count=2
    )

    chunks = chunk(pages, hard_key="page")

    assert [piece.location["page"] for piece in chunks] == [1, 2]
    assert "beta" not in chunks[0].content


def test_long_single_block_is_split():
    extracted = Extracted(
        [Block("sentence. " * 1000, {"lineStart": 1, "lineEnd": 1, "headings": []})]
    )

    chunks = chunk(extracted)

    assert len(chunks) >= 6
    assert all(piece.location["lineStart"] == 1 for piece in chunks)


def test_chunk_count_is_limited():
    blocks = [Block("x" * 1590, {"page": index}) for index in range(1, MAX_CHUNKS + 3)]

    with pytest.raises(IngestionFailure) as raised:
        chunk(Extracted(blocks), hard_key="page")

    assert raised.value.code == "too_much_text"
