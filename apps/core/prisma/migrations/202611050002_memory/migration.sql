CREATE TABLE core.tutor_conversation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES core.workspace(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  title TEXT CHECK (char_length(title) BETWEEN 1 AND 80),
  summary JSONB,
  summary_through_id UUID,
  summary_through_at TIMESTAMPTZ(3),
  summary_source_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((summary_through_id IS NULL) = (summary_through_at IS NULL))
);
CREATE INDEX tutor_conversation_workspace_id_last_active_at_idx ON core.tutor_conversation(workspace_id, last_active_at DESC);
CREATE INDEX tutor_conversation_user_id_idx ON core.tutor_conversation(user_id);

CREATE TABLE core.memory_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('preference', 'difficulty')),
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 3 AND 200),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'active')),
  origin TEXT NOT NULL CHECK (origin IN ('learner', 'seymour')),
  execution_id UUID UNIQUE,
  expires_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((status = 'proposed') = (expires_at IS NOT NULL)),
  CHECK (origin = 'seymour' OR execution_id IS NULL)
);
CREATE UNIQUE INDEX memory_item_user_text_key ON core.memory_item(user_id, lower(btrim(text)));
CREATE INDEX memory_item_user_id_status_updated_at_idx ON core.memory_item(user_id, status, updated_at DESC);

ALTER TABLE core.execution ADD COLUMN conversation_id UUID REFERENCES core.tutor_conversation(id) ON DELETE CASCADE;
CREATE INDEX execution_conversation_id_created_at_idx ON core.execution(conversation_id, created_at);

WITH chats AS (
  SELECT id, workspace_id, input, created_at
  FROM core.execution
  WHERE input->>'kind' = 'chat' AND input ? 'mode'
), first_chats AS (
  SELECT DISTINCT ON (workspace_id) workspace_id, input->>'prompt' AS prompt
  FROM chats
  ORDER BY workspace_id, created_at, id
)
INSERT INTO core.tutor_conversation (workspace_id, user_id, title, created_at, last_active_at)
SELECT chats.workspace_id, workspace.user_id, NULLIF(left(btrim(first_chats.prompt), 80), ''),
       min(chats.created_at), max(chats.created_at)
FROM chats
JOIN first_chats ON first_chats.workspace_id = chats.workspace_id
JOIN core.workspace ON workspace.id = chats.workspace_id
GROUP BY chats.workspace_id, workspace.user_id, first_chats.prompt;

UPDATE core.execution AS execution
SET conversation_id = conversation.id
FROM core.tutor_conversation AS conversation
WHERE execution.workspace_id = conversation.workspace_id
  AND execution.input->>'kind' = 'chat'
  AND execution.input ? 'mode';
