-- Plain words of what catalog search covers; misspelled searches are corrected against them.
ALTER TABLE core.roadmap_publication ADD COLUMN search_text TEXT NOT NULL DEFAULT '';

UPDATE core.roadmap_publication AS publication
SET search_text = concat_ws(
  E'\n',
  roadmap.definition->>'title',
  (
    SELECT string_agg(concept, ' ')
    FROM jsonb_array_elements(roadmap.definition->'steps') AS step,
      jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(step->'concepts') = 'array' THEN step->'concepts' ELSE '[]'::jsonb END
      ) AS concept
  ),
  (
    SELECT string_agg(step->>'title', ' ')
    FROM jsonb_array_elements(roadmap.definition->'steps') AS step
  ),
  roadmap.definition->>'description'
)
FROM core.roadmap AS roadmap
WHERE roadmap.id = publication.roadmap_id;

ALTER TABLE core.roadmap_publication ALTER COLUMN search_text DROP DEFAULT;

CREATE OR REPLACE FUNCTION core.protect_roadmap_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Roadmap publications are permanent';
  END IF;

  IF (NEW.roadmap_id, NEW.published_by_user_id, NEW.author_name, NEW.level, NEW.search_text, NEW.search_document, NEW.published_at)
     IS DISTINCT FROM
     (OLD.roadmap_id, OLD.published_by_user_id, OLD.author_name, OLD.level, OLD.search_text, OLD.search_document, OLD.published_at) THEN
    RAISE EXCEPTION 'Publication authorship is immutable';
  END IF;

  RETURN NEW;
END;
$$;
