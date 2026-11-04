from unittest.mock import MagicMock

import pytest

from src.infrastructure.database import database

pytestmark = pytest.mark.unit


def test_session_factory_builds_the_engine_lazily_and_only_once(monkeypatch):
    engine = MagicMock()
    create_engine = MagicMock(return_value=engine)
    session_factory = MagicMock()
    create_sessions = MagicMock(return_value=session_factory)
    monkeypatch.setattr(database, "_create_engine", create_engine)
    monkeypatch.setattr(database, "async_sessionmaker", create_sessions)
    database.get_session_factory.cache_clear()

    try:
        create_engine.assert_not_called()

        first = database.get_session_factory()
        second = database.get_session_factory()

        assert first is second is session_factory
        create_engine.assert_called_once_with()
        create_sessions.assert_called_once_with(engine, expire_on_commit=False)
    finally:
        database.get_session_factory.cache_clear()
