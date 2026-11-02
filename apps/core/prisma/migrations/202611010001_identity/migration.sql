CREATE TABLE IF NOT EXISTS core.health_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), checked_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE core.app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL
);
CREATE TABLE core.auth_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  token_id UUID NOT NULL, expires_at TIMESTAMPTZ(3) NOT NULL, revoked_at TIMESTAMPTZ(3)
);
CREATE INDEX auth_session_user_id_idx ON core.auth_session(user_id);
CREATE TABLE core.auth_attempt (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at TIMESTAMPTZ(3) NOT NULL);
