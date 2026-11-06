CREATE TABLE core.learner_profile (
  user_id UUID PRIMARY KEY REFERENCES core.app_user(id) ON DELETE CASCADE,
  time_zone VARCHAR(64),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= current_streak),
  last_study_day DATE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((last_study_day IS NULL) = (longest_streak = 0))
);

CREATE TABLE core.study_day (
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  time_zone VARCHAR(64) NOT NULL,
  first_execution_id UUID NOT NULL,
  first_at TIMESTAMPTZ(3) NOT NULL,
  analyses INTEGER NOT NULL DEFAULT 1 CHECK (analyses >= 1),
  PRIMARY KEY (user_id, day)
);

CREATE TABLE core.achievement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('roadmap_completed')),
  roadmap_id VARCHAR(100) NOT NULL REFERENCES core.roadmap(id),
  workspace_id UUID NOT NULL REFERENCES core.workspace(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL,
  title TEXT NOT NULL,
  concepts TEXT[] NOT NULL DEFAULT '{}',
  step_count INTEGER NOT NULL CHECK (step_count >= 1),
  awarded_at TIMESTAMPTZ(3) NOT NULL,
  UNIQUE (user_id, kind, roadmap_id)
);

CREATE FUNCTION core.reject_achievement_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Achievements are immutable';
END;
$$;
CREATE TRIGGER achievement_immutable BEFORE UPDATE ON core.achievement
FOR EACH ROW EXECUTE FUNCTION core.reject_achievement_update();
