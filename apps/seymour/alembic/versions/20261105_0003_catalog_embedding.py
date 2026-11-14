"""Create catalog embeddings in the Seymour schema."""

from alembic import op

revision: str = "0003"
down_revision: str = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Roadmap ids are opaque keys from Core; Seymour never reads Core tables.
    op.execute("""
        CREATE TABLE seymour.catalog_embedding (
            roadmap_id VARCHAR(100) NOT NULL,
            content_hash CHAR(64) NOT NULL,
            model TEXT NOT NULL,
            embedding public.vector(1536) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (roadmap_id, content_hash, model)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE seymour.catalog_embedding")
