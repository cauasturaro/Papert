"""SQLAlchemy database health adapter."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class SqlAlchemyProbe:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def check(self) -> None:
        await self.session.execute(text("SELECT 1"))
