"""Health probe result."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class HealthStatus:
    status: Literal["ok", "degraded"]
    db: Literal["connected", "unreachable"]
