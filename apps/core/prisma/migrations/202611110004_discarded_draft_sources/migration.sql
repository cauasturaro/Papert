UPDATE core.source_document AS source
SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
FROM core.roadmap_draft AS draft
WHERE source.workspace_id = draft.workspace_id
  AND draft.status = 'discarded'
  AND source.status <> 'deleted';
