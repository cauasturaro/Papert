"""Application health probe use case."""

from src.health.domain.health import HealthStatus
from src.health.domain.ports import DatabaseProbe


async def check_health(probe: DatabaseProbe) -> HealthStatus:
    """Return database reachability without depending on its driver."""
    try:
        await probe.check()

        return HealthStatus(status="ok", db="connected")
    except Exception:
        return HealthStatus(status="degraded", db="unreachable")
