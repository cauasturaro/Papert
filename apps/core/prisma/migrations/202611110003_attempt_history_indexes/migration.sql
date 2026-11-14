CREATE INDEX study_attempt_workspace_id_created_at_id_idx ON core.study_attempt (workspace_id, created_at DESC, id DESC);
