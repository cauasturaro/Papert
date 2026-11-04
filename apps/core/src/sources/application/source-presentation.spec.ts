import { presentSource } from './source-presentation.js';
import { objectKey } from '../domain/source.js';
import type { StoredSource } from '../domain/source.js';

const id = '11111111-1111-4111-8111-111111111111';

function source(overrides: Partial<StoredSource> = {}): StoredSource {
  return {
    id,
    workspaceId: '22222222-2222-4222-8222-222222222222',
    bucket: 'papert-sources',
    objectKey: objectKey(id, 'pdf'),
    filename: 'guide.pdf',
    format: 'pdf',
    sizeBytes: 100,
    status: 'awaiting_upload',
    objectVersionId: null,
    sequencer: null,
    errorCode: null,
    chunkCount: null,
    characterCount: null,
    pageCount: null,
    warnings: [],
    uploadExpiresAt: new Date('2026-11-03T12:10:00Z'),
    createdAt: new Date('2026-11-03T12:00:00Z'),
    updatedAt: new Date('2026-11-03T12:00:00Z'),
    readyAt: null,
    ...overrides,
  };
}

describe('source presentation', () => {
  it('reports expired uploads and learner-safe error messages', () => {
    const now = new Date('2026-11-03T13:00:00Z');

    const expired = presentSource(source(), now);
    const failed = presentSource(
      source({ status: 'failed', errorCode: 'no_text' }),
      now,
    );

    expect(expired.status).toBe('failed');
    expect(expired.error?.code).toBe('upload_expired');
    expect(failed.error?.message).toMatch(/No extractable text/);
  });
});
