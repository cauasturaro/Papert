"""Health check capabilities."""

from typing import Protocol


class DatabaseProbe(Protocol):
    async def check(self) -> None: ...
