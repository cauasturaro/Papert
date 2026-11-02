CREATE TABLE core.roadmap (
  id VARCHAR(100) PRIMARY KEY,
  author_name TEXT NOT NULL,
  author_user_id UUID REFERENCES core.app_user(id) ON DELETE RESTRICT,
  definition JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE core.workspace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  roadmap_id VARCHAR(100) NOT NULL REFERENCES core.roadmap(id) ON DELETE RESTRICT,
  current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  notes TEXT NOT NULL DEFAULT '',
  files JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, roadmap_id)
);

CREATE TABLE core.study_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES core.workspace(id) ON DELETE CASCADE,
  last_opened_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE core.study_attempt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES core.workspace(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  files JSONB NOT NULL,
  challenge JSONB NOT NULL,
  result JSONB NOT NULL DEFAULT '{"status":"not_evaluated"}',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, revision, step_id)
);

CREATE FUNCTION core.reject_roadmap_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Consolidated roadmaps are immutable';
END;
$$;
CREATE TRIGGER roadmap_immutable BEFORE UPDATE OR DELETE ON core.roadmap
FOR EACH ROW EXECUTE FUNCTION core.reject_roadmap_mutation();

-- Results will be recorded by Core evaluation; the submitted evidence cannot change.
CREATE FUNCTION core.protect_attempt_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.workspace_id, NEW.step_id, NEW.revision, NEW.files, NEW.challenge, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.workspace_id, OLD.step_id, OLD.revision, OLD.files, OLD.challenge, OLD.created_at) THEN
    RAISE EXCEPTION 'Attempt snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attempt_snapshot_immutable BEFORE UPDATE ON core.study_attempt
FOR EACH ROW EXECUTE FUNCTION core.protect_attempt_snapshot();
