"""Tests for GET /health using a mocked DB session (no real database required)."""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock

from main import app
from src.infrastructure.database.database import get_session


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    """Guarantee overrides are cleared after every test, even on failure."""
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def mock_session():
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock())
    return session


@pytest.mark.unit
async def test_health_endpoint_ok(mock_session):
    app.dependency_overrides[get_session] = lambda: mock_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "connected"}


@pytest.mark.unit
async def test_health_endpoint_degraded_when_db_fails(mock_session):
    mock_session.execute = AsyncMock(side_effect=Exception("db down"))
    app.dependency_overrides[get_session] = lambda: mock_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "degraded", "db": "unreachable"}
