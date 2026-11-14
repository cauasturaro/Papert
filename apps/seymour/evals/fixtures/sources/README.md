# Orrery RAG corpus, version 1
These fictional facts test retrieval, citations, injection resistance, and workspace isolation.
Upload only the files assigned to each workspace in `../../datasets/retrieval.json`; do not upload this README.
Keep `isolation-secret.md` exclusively in the `other` workspace.
From the repository root, regenerate with:
`apps/ingestion/.venv/bin/python apps/seymour/evals/fixtures/build_sources.py`
Check authoritative extraction and dataset locations with:
`apps/ingestion/.venv/bin/python apps/seymour/evals/fixtures/build_sources.py --check`
Generation requires macOS `textutil`; checking is offline and does not run the tutor or retrieval service.
