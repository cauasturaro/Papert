-- Serves the latest-attempt-per-step lookup with an index scan instead of sorting the history.
CREATE INDEX study_attempt_workspace_id_step_id_created_at_id_idx ON core.study_attempt (workspace_id, step_id, created_at DESC, id DESC);
