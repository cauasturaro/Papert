CREATE TABLE core.roadmap_publication (
  roadmap_id VARCHAR(100) PRIMARY KEY REFERENCES core.roadmap(id) ON DELETE RESTRICT,
  published_by_user_id UUID REFERENCES core.app_user(id) ON DELETE RESTRICT,
  author_name TEXT NOT NULL CHECK (char_length(author_name) BETWEEN 2 AND 40),
  level TEXT CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  search_document TSVECTOR NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0 CHECK (upvotes >= 0),
  downvotes INTEGER NOT NULL DEFAULT 0 CHECK (downvotes >= 0),
  score DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 1),
  published_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX roadmap_publication_search_document_idx ON core.roadmap_publication USING GIN (search_document);
CREATE INDEX roadmap_publication_score_upvotes_published_at_idx ON core.roadmap_publication(score DESC, upvotes DESC, published_at DESC);
CREATE INDEX roadmap_publication_published_at_idx ON core.roadmap_publication(published_at DESC);
CREATE INDEX roadmap_publication_published_by_user_id_idx ON core.roadmap_publication(published_by_user_id);

CREATE FUNCTION core.protect_roadmap_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Roadmap publications are permanent';
  END IF;

  IF (NEW.roadmap_id, NEW.published_by_user_id, NEW.author_name, NEW.level, NEW.search_document, NEW.published_at)
     IS DISTINCT FROM
     (OLD.roadmap_id, OLD.published_by_user_id, OLD.author_name, OLD.level, OLD.search_document, OLD.published_at) THEN
    RAISE EXCEPTION 'Publication authorship is immutable';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER roadmap_publication_protected BEFORE UPDATE OR DELETE ON core.roadmap_publication
FOR EACH ROW EXECUTE FUNCTION core.protect_roadmap_publication();

CREATE TABLE core.roadmap_vote (
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE RESTRICT,
  roadmap_id VARCHAR(100) NOT NULL REFERENCES core.roadmap_publication(roadmap_id) ON DELETE RESTRICT,
  value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, roadmap_id)
);
CREATE INDEX roadmap_vote_roadmap_id_idx ON core.roadmap_vote(roadmap_id);

CREATE TABLE core.library_entry (
  user_id UUID NOT NULL REFERENCES core.app_user(id) ON DELETE CASCADE,
  roadmap_id VARCHAR(100) NOT NULL REFERENCES core.roadmap_publication(roadmap_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, roadmap_id)
);
CREATE INDEX library_entry_user_id_created_at_idx ON core.library_entry(user_id, created_at DESC);

ALTER TABLE core.roadmap_draft ADD COLUMN recommendation JSONB;
