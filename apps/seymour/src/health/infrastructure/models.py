"""Infrastructure: SQLAlchemy ORM model for the health check proof table."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.database import Base


class HealthCheck(Base):
    """Proof-of-migration table.
    Verifies the ORM/Alembic workflow and DB connectivity.
    Will be removed once domain models replace it later.
    """

    __tablename__ = "health_check"
    __table_args__ = {"schema": "seymour"}

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
