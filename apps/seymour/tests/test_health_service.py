"""Unit tests for the health use-case.
The DB session is mocked — no real database required.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from src.health.application.health_service import check_health
from src.health.domain.health import HealthStatus


@pytest.mark.asyncio
async def test_check_health_returns_ok_when_query_succeeds():
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock())

    result = await check_health(session)

    assert result == HealthStatus(status="ok", db="connected")


@pytest.mark.asyncio
async def test_check_health_returns_degraded_when_query_raises():
    session = AsyncMock()
    session.execute = AsyncMock(side_effect=Exception("connection refused"))

    result = await check_health(session)

    assert result == HealthStatus(status="degraded", db="unreachable")
