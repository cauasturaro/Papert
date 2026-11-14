import pytest

from src.domain.chunking import chunk
from src.domain.extraction.common import _clean
from src.domain.extraction.markdown import extract_markdown

pytestmark = pytest.mark.unit


def test_markdown_preserves_code_literals_tabs_and_deep_indentation():
    code = '```python\nvalue = "left    right"\n\tprint(value)\n                    pass\n```'

    extracted = extract_markdown(code.replace("\n", "\r\n").encode())

    assert extracted.blocks[0].text == code
    assert chunk(extracted)[0].content == code


def test_non_layout_cleaning_preserves_code_whitespace():
    code = '\tvalue = "left    right"\n                    pass'

    assert _clean(code) == code
