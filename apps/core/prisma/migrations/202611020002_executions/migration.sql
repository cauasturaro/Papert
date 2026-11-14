CREATE TABLE core.execution_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  UNIQUE (user_id, period),
  CHECK (used + reserved <= 30000)
);

CREATE TABLE core.execution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES core.workspace(id) ON DELETE CASCADE,
  quota_id UUID NOT NULL REFERENCES core.execution_quota(id) ON DELETE CASCADE,
  request_key UUID NOT NULL,
  input JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'timed_out')),
  text TEXT NOT NULL DEFAULT '',
  sequence INTEGER NOT NULL DEFAULT 0,
  event_index INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  reserved INTEGER NOT NULL DEFAULT 3000 CHECK (reserved >= 0),
  leases UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  settled_leases UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  charged INTEGER NOT NULL DEFAULT 0 CHECK (charged >= 0),
  lease UUID,
  lease_until TIMESTAMPTZ(3),
  published_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deadline TIMESTAMPTZ(3) NOT NULL,
  first_event_at TIMESTAMPTZ(3),
  finished_at TIMESTAMPTZ(3),
  UNIQUE (user_id, request_key)
);
CREATE INDEX execution_status_published_at_idx ON core.execution(status, published_at);
CREATE INDEX execution_user_id_created_at_idx ON core.execution(user_id, created_at);

CREATE TABLE core.stream_ticket (
  hash TEXT PRIMARY KEY,
  execution_id UUID NOT NULL REFERENCES core.execution(id) ON DELETE CASCADE,
  auth_session_id UUID NOT NULL,
  token_id UUID NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX stream_ticket_expires_at_idx ON core.stream_ticket(expires_at);
