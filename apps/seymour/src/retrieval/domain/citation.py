"""How a retrieved passage is cited back to the learner."""


def cite(filename: str, location: dict) -> str:
    """Readable location such as `guide.pdf, p. 3` or `notes.md, lines 4-9`."""
    if "page" in location:
        return f"{filename}, p. {location['page']}"

    if "lineStart" in location:
        return f"{filename}, lines {location['lineStart']}-{location['lineEnd']}"

    if "paragraphStart" in location:
        heading = location.get("heading")
        paragraphs = f"¶ {location['paragraphStart']}-{location['paragraphEnd']}"

        return f"{filename}, {heading} ({paragraphs})" if heading else f"{filename}, {paragraphs}"

    return filename
