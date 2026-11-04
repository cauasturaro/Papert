"""Health use-case tests use a database probe fake without SQLAlchemy."""

import pytest

from src.health.application.health_service import check_health
from src.health.domain.health import HealthStatus


class FakeProbe:
    def __init__(self, error=None):
        self.error = error

    async def check(self):
        if self.error is not None:
            raise self.error


@pytest.mark.asyncio
async def test_check_health_returns_ok_when_query_succeeds():
    probe = FakeProbe()

    result = await check_health(probe)

    assert result == HealthStatus(status="ok", db="connected")


@pytest.mark.asyncio
async def test_check_health_returns_degraded_when_query_raises():
    probe = FakeProbe(Exception("connection refused"))

    result = await check_health(probe)

    assert result == HealthStatus(status="degraded", db="unreachable")
