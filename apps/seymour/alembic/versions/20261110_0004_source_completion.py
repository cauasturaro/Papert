"""Persist resumable source indexing results and pipeline revision."""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE seymour.source_document
        ADD COLUMN completion JSONB,
        ADD COLUMN index_job TEXT,
        ADD COLUMN pipeline_revision TEXT NOT NULL DEFAULT '1'
    """)


def downgrade():
    op.execute("""
        ALTER TABLE seymour.source_document
        DROP COLUMN completion, DROP COLUMN index_job, DROP COLUMN pipeline_revision
    """)
