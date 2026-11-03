-- Keep limits in sync with src/sources/domain/source.ts.
CREATE TABLE core.source_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES core.workspace(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 200),
  format TEXT NOT NULL CHECK (format IN ('pdf', 'doc', 'docx', 'md')),
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 15728640),
  status TEXT NOT NULL DEFAULT 'awaiting_upload' CHECK (status IN ('awaiting_upload', 'processing', 'ready', 'failed', 'deleted')),
  object_version_id TEXT,
  sequencer TEXT,
  error_code TEXT,
  error_message TEXT,
  chunk_count INTEGER CHECK (chunk_count >= 0),
  character_count INTEGER CHECK (character_count >= 0),
  page_count INTEGER CHECK (page_count >= 0),
  embedding_tokens INTEGER CHECK (embedding_tokens >= 0),
  warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
  upload_expires_at TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ready_at TIMESTAMPTZ(3),
  deleted_at TIMESTAMPTZ(3),
  purged_at TIMESTAMPTZ(3),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);
CREATE INDEX source_document_workspace_id_status_idx ON core.source_document(workspace_id, status);
CREATE INDEX source_document_uploaded_by_user_id_created_at_idx ON core.source_document(uploaded_by_user_id, created_at);
CREATE INDEX source_document_status_upload_expires_at_idx ON core.source_document(status, upload_expires_at);
