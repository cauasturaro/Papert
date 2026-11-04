import type { SourceFormat, StoredSource } from './source.js';

// Opening a source issues fresh, version-pinned links after authorization (ADR-007).
export const VIEW_URL_SECONDS = 300;

// How the Web viewer shows each format; DOC/DOCX use ingestion's text rendition.
export type Renderer = 'pdf' | 'markdown' | 'paragraphs';

const RENDERERS: Record<SourceFormat, Renderer> = {
  pdf: 'pdf',
  md: 'markdown',
  doc: 'paragraphs',
  docx: 'paragraphs',
};

/** Outside `documents/`, so renditions never trigger ingestion events. */
export function renditionPrefix(documentId: string) {
  return `renditions/${documentId}/`;
}

export function renditionKey(documentId: string, versionId: string) {
  return `${renditionPrefix(documentId)}${versionId}.json`;
}

export type ViewPlan =
  | { kind: 'not_found' }
  | { kind: 'not_ready' }
  | {
      kind: 'view';
      renderer: Renderer;
      key: string;
      versionId: string;
      renditionKey: string | null;
    };

/** Only the current version of a ready source can be opened; deleted ones do not exist. */
export function viewPlan(source: StoredSource | null): ViewPlan {
  if (!source || source.status === 'deleted') {
    return { kind: 'not_found' };
  }

  if (source.status !== 'ready' || !source.objectVersionId) {
    return { kind: 'not_ready' };
  }

  const renderer = RENDERERS[source.format];
  const rendition =
    renderer === 'paragraphs'
      ? renditionKey(source.id, source.objectVersionId)
      : null;

  return {
    kind: 'view',
    renderer,
    key: source.objectKey,
    versionId: source.objectVersionId,
    renditionKey: rendition,
  };
}
