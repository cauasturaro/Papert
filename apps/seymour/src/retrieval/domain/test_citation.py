import pytest

from src.retrieval.domain.citation import cite

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("location", "expected"),
    [
        ({"page": 2}, "a.pdf, p. 2"),
        ({"lineStart": 4, "lineEnd": 9, "headings": []}, "a.pdf, lines 4-9"),
        ({"paragraphStart": 1, "paragraphEnd": 3, "heading": "Intro"}, "a.pdf, Intro (¶ 1-3)"),
        ({"paragraphStart": 1, "paragraphEnd": 3, "heading": None}, "a.pdf, ¶ 1-3"),
    ],
)
def test_citations_name_the_location(location, expected):
    assert cite("a.pdf", location) == expected
