"""Viewer text with the extractor's citation locations."""

from src.domain.extraction import Extracted


def rendition_key(document_id: str, version_id: str) -> str:
    return f"renditions/{document_id}/{version_id}.json"


def rendition(document_id: str, version_id: str, format: str, extracted: Extracted) -> dict | None:
    if format not in ("doc", "docx"):
        return None

    return {
        "version": 1,
        "documentId": document_id,
        "versionId": version_id,
        "format": format,
        "blocks": [{"text": block.text, "location": block.location} for block in extracted.blocks],
    }
