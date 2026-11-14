-- Refresh credentials are stored only as SHA-256 hashes. The previous hash is
-- kept for one generation so a replayed refresh token can be detected.
ALTER TABLE core.auth_session
  ADD COLUMN refresh_hash TEXT,
  ADD COLUMN previous_refresh_hash TEXT,
  ADD COLUMN refresh_rotated_at TIMESTAMPTZ(3);

CREATE UNIQUE INDEX auth_session_refresh_hash_key ON core.auth_session(refresh_hash);
CREATE INDEX auth_session_previous_refresh_hash_idx ON core.auth_session(previous_refresh_hash);
