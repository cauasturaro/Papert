import json
import sys
from pathlib import Path

from src.domain.chunking import chunk
from src.domain.extraction.markdown import extract_markdown


def main() -> None:
    chunks = {}

    for filename in sys.argv[1:]:
        data = Path(filename).read_bytes()
        extracted = extract_markdown(data)
        pieces = chunk(extracted)
        chunks[filename] = [
            {
                "ordinal": piece.ordinal,
                "content": piece.content,
                "location": piece.location,
                "start": piece.char_start,
            }
            for piece in pieces
        ]

    print(json.dumps(chunks))


if __name__ == "__main__":
    main()
