-- Source support and citations of a tutor answer (ADR-007); null when no sources applied.
ALTER TABLE core.execution ADD COLUMN grounding JSONB;
