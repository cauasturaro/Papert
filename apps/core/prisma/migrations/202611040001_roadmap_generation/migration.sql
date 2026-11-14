-- Preparation workspaces exist before their roadmap.
ALTER TABLE core.workspace ALTER COLUMN roadmap_id DROP NOT NULL;

CREATE FUNCTION core.protect_workspace_roadmap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.roadmap_id IS NOT NULL AND NEW.roadmap_id IS DISTINCT FROM OLD.roadmap_id THEN
    RAISE EXCEPTION 'A workspace roadmap is bound once';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER workspace_roadmap_bound_once BEFORE UPDATE OF roadmap_id ON core.workspace
FOR EACH ROW EXECUTE FUNCTION core.protect_workspace_roadmap();

-- Keep limits in sync with src/study/domain/roadmap-draft.ts.
CREATE TABLE core.roadmap_draft (
  workspace_id UUID PRIMARY KEY REFERENCES core.workspace(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  goal TEXT NOT NULL CHECK (char_length(goal) BETWEEN 10 AND 500),
  level TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'generating', 'generated', 'failed', 'discarded')),
  execution_id UUID REFERENCES core.execution(id) ON DELETE SET NULL,
  outcome JSONB,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX roadmap_draft_user_id_status_idx ON core.roadmap_draft(user_id, status);
