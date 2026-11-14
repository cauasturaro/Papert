CREATE TABLE core.answer_feedback (
  execution_id UUID PRIMARY KEY REFERENCES core.execution(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  hallucination BOOLEAN NOT NULL DEFAULT false,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  delivered_revision INTEGER NOT NULL DEFAULT 0,
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  next_delivery_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (NOT hallucination OR rating = 'down'),
  CHECK (delivered_revision BETWEEN 0 AND revision),
  CHECK ((delivered_revision = revision) = (next_delivery_at IS NULL))
);
CREATE INDEX answer_feedback_pending_idx ON core.answer_feedback(next_delivery_at) WHERE delivered_revision < revision;
CREATE INDEX answer_feedback_user_id_idx ON core.answer_feedback(user_id);
