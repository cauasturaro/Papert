"""Builds small reference documents for tests and the end-to-end smoke."""

import io

import docx


def _escape(text):
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def pdf_bytes(pages):
    """A minimal valid PDF; `None` produces a page without any text (like a scan)."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        None,
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    kids = []

    for text in pages:
        lines = [] if text is None else text.split("\n")
        commands = (
            ["0 0 1 rg 100 100 200 200 re f"] if text is None else ["BT /F1 12 Tf 72 720 Td 14 TL"]
        )

        for line in lines:
            commands.append(f"({_escape(line)}) Tj T*")

        if text is not None:
            commands.append("ET")

        stream = "\n".join(commands).encode("latin-1")
        objects.append(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
        content_id = len(objects)
        objects.append(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>"
            % content_id
        )
        kids.append(len(objects))

    objects[1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (
        b" ".join(b"%d 0 R" % kid for kid in kids),
        len(kids),
    )

    return _serialize_pdf(objects)


def docx_bytes(heading, paragraphs):
    document = docx.Document()
    document.add_heading(heading, level=1)

    for paragraph in paragraphs:
        document.add_paragraph(paragraph)

    output = io.BytesIO()
    document.save(output)

    return output.getvalue()


REFERENCE_MARKDOWN = """# Testing strategy

Unit tests cover pure domain rules without a database.

## Integration tests

Integration tests exercise adapters against real infrastructure.

```python
# not a heading inside a fence
assert repository.save(entity)
```
"""


def positioned_pdf_bytes(lines):
    """One page where every word is placed separately, like exported design tools do."""
    commands = ["BT /F1 10 Tf"]  # Courier 10 pt: 6 pt per character
    y = 720

    for indent, line in lines:
        x = 72 + indent * 6

        for word in line.split(" "):
            commands.append(f"1 0 0 1 {x} {y} Tm ({_escape(word)}) Tj")
            x += 6 * (len(word) + 1)

        y -= 16

    commands.append("ET")

    return _single_page_pdf("\n".join(commands).encode("latin-1"))


def _single_page_pdf(stream):
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
    ]

    return _serialize_pdf(objects)


def _serialize_pdf(objects):
    output = io.BytesIO()
    output.write(b"%PDF-1.4\n")
    offsets = []

    for number, body in enumerate(objects, start=1):
        offsets.append(output.tell())
        output.write(b"%d 0 obj\n%s\nendobj\n" % (number, body))

    xref = output.tell()
    output.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1))

    for offset in offsets:
        output.write(b"%010d 00000 n \n" % offset)

    output.write(
        b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    )

    return output.getvalue()
