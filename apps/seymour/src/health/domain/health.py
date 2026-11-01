"""Domain: health probe result.
Pure dataclass — no framework or infrastructure dependency.
"""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class HealthStatus:
    status: Literal["ok", "degraded"]
    db: Literal["connected", "unreachable"]
