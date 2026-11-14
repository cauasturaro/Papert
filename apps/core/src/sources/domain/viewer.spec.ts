import { describe, expect, it } from 'vitest';
import type { StoredSource } from './source.js';
import { renditionKey, viewPlan } from './viewer.js';

const ID = '11111111-1111-4111-8111-111111111111';

function source(overrides: Partial<StoredSource> = {}): StoredSource {
  return {
    id: ID,
    workspaceId: 'workspace',
    bucket: 'papert-sources',
    objectKey: `documents/${ID}/original.docx`,
    filename: 'notes.docx',
    format: 'docx',
    sizeBytes: 10,
    status: 'ready',
    objectVersionId: 'v2',
    sequencer: '01',
    errorCode: null,
    chunkCount: 1,
    characterCount: 10,
    pageCount: null,
    warnings: [],
    uploadExpiresAt: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    readyAt: new Date(0),
    ...overrides,
  };
}

describe('viewPlan', () => {
  it('opens the current version and its rendition for Word documents', () => {
    const plan = viewPlan(source());

    expect(plan).toEqual({
      kind: 'view',
      renderer: 'paragraphs',
      key: `documents/${ID}/original.docx`,
      versionId: 'v2',
      renditionKey: `renditions/${ID}/v2.json`,
    });
  });

  it('opens PDF and Markdown originals without a rendition', () => {
    const pdf = viewPlan(source({ format: 'pdf' }));
    const markdown = viewPlan(source({ format: 'md' }));

    expect(pdf).toMatchObject({ renderer: 'pdf', renditionKey: null });
    expect(markdown).toMatchObject({
      renderer: 'markdown',
      renditionKey: null,
    });
  });

  it('refuses deleted, missing and unfinished sources', () => {
    expect(viewPlan(null)).toEqual({ kind: 'not_found' });
    expect(viewPlan(source({ status: 'deleted' }))).toEqual({
      kind: 'not_found',
    });
    expect(viewPlan(source({ status: 'processing' }))).toEqual({
      kind: 'not_ready',
    });
    expect(viewPlan(source({ objectVersionId: null }))).toEqual({
      kind: 'not_ready',
    });
  });

  it('keys renditions by document and version', () => {
    expect(renditionKey(ID, 'abc')).toBe(`renditions/${ID}/abc.json`);
  });
});
