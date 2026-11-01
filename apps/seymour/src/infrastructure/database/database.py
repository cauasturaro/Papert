"""Infrastructure: async SQLAlchemy engine and session factory.

The search_path is forced to 'seymour, public' on every new connection so all
DDL and DML land in the correct schema regardless of the connection-string default.
"""

from collections.abc import AsyncGenerator

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .settings import get_settings


class Base(DeclarativeBase):
    """Shared declarative base for all Seymour ORM models."""


def _set_search_path(dbapi_conn, _connection_record) -> None:
    cursor = dbapi_conn.cursor()
    cursor.execute("SET search_path TO seymour, public")
    cursor.close()


def _create_engine():
    url = get_settings().seymour_database_url
    if not url:
        return None
    engine = create_async_engine(url, echo=False, pool_pre_ping=True)
    event.listen(engine.sync_engine, "connect", _set_search_path)
    return engine


_engine = _create_engine()

SessionLocal: async_sessionmaker[AsyncSession] | None = (
    async_sessionmaker(_engine, expire_on_commit=False) if _engine else None
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields a scoped AsyncSession per request."""
    if SessionLocal is None:
        raise RuntimeError(
            "Database not configured — set SEYMOUR_DATABASE_URL and restart."
        )
    async with SessionLocal() as session:
        yield session
