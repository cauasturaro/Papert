import json

import pytest

from src.chunk_preview import main

pytestmark = pytest.mark.unit


def test_chunk_preview_emits_ingestion_locations(tmp_path, monkeypatch, capsys):
    source = tmp_path / "source.md"
    source.write_text("# HTTP\n\nHTTP requests contain headers.\n", encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["chunk_preview", str(source)])

    main()

    output = json.loads(capsys.readouterr().out)
    [piece] = output[str(source)]
    assert piece["ordinal"] == 0
    assert "HTTP requests contain headers." in piece["content"]
    assert piece["location"]["headings"] == ["HTTP"]
    assert piece["start"] == 0
