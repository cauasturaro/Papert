"""Initial migration: health_check table in seymour schema.

Proves the ORM/Alembic workflow and DB connectivity.
Will be superseded by domain model migrations in later phases.

Revision ID: 0001
Revises:
Create Date: 2026-11-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "health_check",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column(
            "checked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="seymour",
    )


def downgrade() -> None:
    op.drop_table("health_check", schema="seymour")
