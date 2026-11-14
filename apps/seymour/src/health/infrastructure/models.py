"""SQLAlchemy model of the table created by the first migration."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from src.shared.infrastructure.database.database import Base


class HealthCheck(Base):
    """Gives Alembic autogenerate a mapped table, so the migration workflow is exercised."""

    __tablename__ = "health_check"
    __table_args__ = {"schema": "seymour"}

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
