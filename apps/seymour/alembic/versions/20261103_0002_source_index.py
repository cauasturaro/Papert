"""Create source documents and vector chunks in the Seymour schema."""

from alembic import op

revision: str = "0002"
down_revision: str = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE seymour.source_document (
            document_id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL,
            object_version_id TEXT,
            sequencer TEXT,
            deleted BOOLEAN NOT NULL DEFAULT false,
            chunk_count INTEGER NOT NULL DEFAULT 0,
            character_count INTEGER NOT NULL DEFAULT 0,
            embedding_model TEXT,
            embedding_dimensions INTEGER,
            indexed_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT source_document_chunk_count_check CHECK (chunk_count >= 0)
        )
    """)
    op.execute("""
        CREATE INDEX source_document_workspace_id_idx
        ON seymour.source_document (workspace_id)
    """)

    # pgvector is installed in public; avoid depending on a Python vector type.
    op.execute("""
        CREATE TABLE seymour.source_chunk (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            document_id UUID NOT NULL
                REFERENCES seymour.source_document (document_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL,
            ordinal INTEGER NOT NULL,
            content TEXT NOT NULL,
            location JSONB NOT NULL,
            char_start INTEGER NOT NULL,
            char_end INTEGER NOT NULL,
            token_count INTEGER NOT NULL,
            embedding public.vector(1536) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT source_chunk_document_ordinal_key UNIQUE (document_id, ordinal),
            CONSTRAINT source_chunk_ordinal_check CHECK (ordinal >= 0),
            CONSTRAINT source_chunk_char_range_check CHECK (char_end >= char_start)
        )
    """)
    op.execute("""
        CREATE INDEX source_chunk_workspace_document_idx
        ON seymour.source_chunk (workspace_id, document_id)
    """)
    op.execute("""
        CREATE INDEX source_chunk_embedding_idx
        ON seymour.source_chunk USING hnsw (embedding public.vector_cosine_ops)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE seymour.source_chunk")

    op.execute("DROP TABLE seymour.source_document")
