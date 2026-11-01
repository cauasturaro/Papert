"""Alembic migration environment — async SQLAlchemy pattern."""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from src.infrastructure.database.database import Base

# Register all models so autogenerate can detect them.
# Add imports here as new domain models are created.
from src.health.infrastructure.models import HealthCheck  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    url = os.environ.get("SEYMOUR_DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "SEYMOUR_DATABASE_URL is not set. "
            "Run 'make up' to generate .env or export the variable."
        )
    return url


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live DB connection."""
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        version_table_schema="seymour",
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: AsyncConnection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        version_table_schema="seymour",
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations against a live DB using asyncpg."""
    engine = create_async_engine(get_url(), echo=False)
    async with engine.connect() as conn:
        await conn.execute(text("SET search_path TO seymour, public"))
        await conn.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
