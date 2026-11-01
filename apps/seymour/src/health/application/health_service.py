"""Application: health probe use-case.
Depends on an AsyncSession port via constructor injection.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.health.domain.health import HealthStatus


async def check_health(session: AsyncSession) -> HealthStatus:
    """Execute a trivial DB query; return HealthStatus."""
    try:
        await session.execute(text("SELECT 1"))
        return HealthStatus(status="ok", db="connected")
    except Exception:
        return HealthStatus(status="degraded", db="unreachable")
