"""Main-document text of Word 97-2003 binary files through the FIB and piece table.

Reference: [MS-DOC] FibBase, FibRgLw97 (ccpText), FibRgFcLcb97 (fcClx/lcbClx), Clx and Pcd.
"""

import io
import struct
import time

import olefile

from src.domain.errors import IngestionFailure
from src.domain.extraction.common import Block, Extracted, _check_text_limit, _clean
from src.infrastructure.extraction.support import _check_deadline

WORD_IDENT = 0xA5EC
FLAG_ENCRYPTED = 0x0100
FLAG_TABLE_1 = 0x0200
CLX_INDEX = 33

# Compressed pieces store cp1252 except for these code points ([MS-DOC] 2.4.1).
COMPRESSED_OVERRIDES = {
    0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†",
    0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8A: "Š", 0x8B: "‹",
    0x8C: "Œ", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”",
    0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™",
    0x9A: "š", 0x9B: "›", 0x9C: "œ", 0x9F: "Ÿ",
}  # fmt: skip


def _corrupt():
    return IngestionFailure("corrupt_file")


def _fib(word):
    if len(word) < 34:
        raise _corrupt()

    (ident,) = struct.unpack_from("<H", word, 0)
    (flags,) = struct.unpack_from("<H", word, 0x0A)

    if ident != WORD_IDENT:
        raise _corrupt()

    if flags & FLAG_ENCRYPTED:
        raise IngestionFailure("encrypted")

    offset = 32
    (csw,) = struct.unpack_from("<H", word, offset)
    offset += 2 + csw * 2

    (cslw,) = struct.unpack_from("<H", word, offset)
    lw_offset = offset + 2
    offset = lw_offset + cslw * 4

    (cb_fc_lcb,) = struct.unpack_from("<H", word, offset)
    fc_offset = offset + 2

    if cslw < 4 or cb_fc_lcb <= CLX_INDEX or len(word) < fc_offset + cb_fc_lcb * 8:
        raise _corrupt()

    (ccp_text,) = struct.unpack_from("<i", word, lw_offset + 3 * 4)
    fc_clx, lcb_clx = struct.unpack_from("<II", word, fc_offset + CLX_INDEX * 8)
    table = "1Table" if flags & FLAG_TABLE_1 else "0Table"

    return ccp_text, fc_clx, lcb_clx, table


def _piece_table(clx):
    offset = 0

    # Skip Prc entries (property modifiers) that precede the Pcdt.
    while offset < len(clx) and clx[offset] == 0x01:
        if offset + 3 > len(clx):
            raise _corrupt()

        (size,) = struct.unpack_from("<H", clx, offset + 1)
        offset += 3 + size

        if offset > len(clx):
            raise _corrupt()

    if offset + 5 > len(clx) or clx[offset] != 0x02:
        raise _corrupt()

    (lcb,) = struct.unpack_from("<I", clx, offset + 1)
    plc = clx[offset + 5 : offset + 5 + lcb]
    count = (lcb - 4) // 12

    if count < 1 or len(plc) != lcb or (lcb - 4) % 12:
        raise _corrupt()

    positions = struct.unpack_from(f"<{count + 1}I", plc, 0)
    pieces = []

    if any(start > end for start, end in zip(positions, positions[1:], strict=False)):
        raise _corrupt()

    for index in range(count):
        (fc_value,) = struct.unpack_from("<I", plc, 4 * (count + 1) + index * 8 + 2)
        pieces.append((positions[index], positions[index + 1], fc_value))

    return pieces


def _decode_compressed(raw):
    return "".join(
        COMPRESSED_OVERRIDES.get(byte) or bytes([byte]).decode("cp1252", errors="replace")
        for byte in raw
    )


def _strip_fields(text):
    """Keeps field results (between 0x14 and 0x15) and drops field instructions."""
    output = []
    stack = []

    for character in text:
        if character == "\x13":
            stack.append(False)
        elif character == "\x14" and stack:
            stack[-1] = True
        elif character == "\x15" and stack:
            stack.pop()
        elif not stack or stack[-1]:
            output.append(character)

    return "".join(output)


def extract_doc_paragraphs(data):
    try:
        with olefile.OleFileIO(io.BytesIO(data)) as ole:
            word = ole.openstream("WordDocument").read()
            ccp_text, fc_clx, lcb_clx, table_name = _fib(word)

            if not ole.exists(table_name) or lcb_clx == 0:
                raise _corrupt()

            table = ole.openstream(table_name).read()
    except IngestionFailure:
        raise
    except Exception:
        raise _corrupt() from None

    clx = table[fc_clx : fc_clx + lcb_clx]

    if len(clx) != lcb_clx:
        raise _corrupt()

    parts = []

    for cp_start, cp_end, fc_value in _piece_table(clx):
        if cp_start >= ccp_text:
            break

        length = min(cp_end, ccp_text) - cp_start
        compressed = bool(fc_value & 0x40000000)
        fc = fc_value & 0x3FFFFFFF

        if compressed:
            raw = word[fc // 2 : fc // 2 + length]
            parts.append(_decode_compressed(raw))
        else:
            raw = word[fc : fc + length * 2]
            parts.append(raw.decode("utf-16-le", errors="replace"))

        if len(raw) < (length if compressed else length * 2):
            raise _corrupt()

    text = _strip_fields("".join(parts))

    # Paragraph marks, cell marks and page breaks delimit paragraphs.
    normalized = text.replace("\x07", "\r").replace("\x0c", "\r").replace("\x0b", "\n")

    return normalized.split("\r")


def extract_doc(data):
    started = time.monotonic()
    paragraphs = extract_doc_paragraphs(data)

    blocks = []

    for index, paragraph in enumerate(paragraphs):
        _check_deadline(started)
        text = _clean(paragraph)

        if not text:
            continue

        location = {"paragraphStart": index + 1, "paragraphEnd": index + 1, "heading": None}
        blocks.append(Block(text, location))
        _check_text_limit(blocks)

    if not blocks:
        raise IngestionFailure("no_text")

    return Extracted(blocks, warnings=["Legacy DOC headings are not detected."])
