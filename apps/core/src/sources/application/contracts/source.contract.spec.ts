import { describe, expect, it } from 'vitest';
import { controlSchema, registerSchema } from './source.contract.js';

const documentId = '7b0f3f8e-1d2a-4c5b-9e6f-0a1b2c3d4e5f';
const versionReference = {
  documentId,
  versionId: 'version-1',
  sequencer: '00ABcd',
};

describe('registerSchema', () => {
  it('accepts a named file with a positive size and trims the name', () => {
    const registration = {
      filename: '  notes.pdf ',
      contentType: 'application/pdf',
      size: 1,
    };

    const result = registerSchema.safeParse(registration);

    expect(result.success).toBe(true);
    expect(result.data?.filename).toBe('notes.pdf');
  });

  it('preserves integer acceptance beyond the safe range at the wire boundary', () => {
    const registration = {
      filename: 'notes.txt',
      contentType: 'text/plain',
      size: Number.MAX_SAFE_INTEGER + 1,
    };

    expect(registerSchema.safeParse(registration).success).toBe(true);
  });

  it('rejects path separators, control characters and blank or long names', () => {
    const invalidNames = [
      'folder/notes.pdf',
      'folder\\notes.pdf',
      'notes\u0000.pdf',
      'notes\n.pdf',
      '   ',
      'a'.repeat(201),
    ];

    for (const filename of invalidNames) {
      const registration = { filename, contentType: 'text/plain', size: 10 };

      expect(registerSchema.safeParse(registration).success).toBe(false);
    }
  });

  it('rejects empty or fractional sizes and unknown fields', () => {
    const base = { filename: 'notes.txt', contentType: 'text/plain' };

    expect(registerSchema.safeParse({ ...base, size: 0 }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, size: 1.5 }).success).toBe(
      false,
    );
    expect(
      registerSchema.safeParse({ ...base, size: 10, owner: 'other' }).success,
    ).toBe(false);
  });
});

describe('controlSchema', () => {
  it('accepts each control action with its own fields', () => {
    const begin = {
      action: 'begin',
      bucket: 'uploads',
      key: 'workspace/notes.pdf',
      versionId: 'version-1',
      sequencer: 'ff',
      size: 0,
    };
    const complete = {
      action: 'complete',
      ...versionReference,
      chunkCount: 3,
      characterCount: 1200,
      pageCount: null,
      embeddingTokens: 0,
      warnings: ['ocr skipped'],
    };
    const fail = { action: 'fail', ...versionReference, code: 'encrypted' };
    const removal = { action: 'removal', bucket: 'uploads', key: 'old.pdf' };
    const reindex = { action: 'reindex', documentId };

    for (const request of [begin, complete, fail, removal, reindex]) {
      expect(controlSchema.safeParse(request).success).toBe(true);
    }
  });

  it('rejects unknown actions, failure codes and fields of other actions', () => {
    const unknownAction = { action: 'purge', documentId };
    const unknownCode = { action: 'fail', ...versionReference, code: 'boom' };
    // Server-assigned failure codes are not reportable by the pipeline.
    const serverCode = {
      action: 'fail',
      ...versionReference,
      code: 'upload_expired',
    };
    const foreignField = { action: 'reindex', documentId, bucket: 'uploads' };

    for (const request of [
      unknownAction,
      unknownCode,
      serverCode,
      foreignField,
    ]) {
      expect(controlSchema.safeParse(request).success).toBe(false);
    }
  });

  it('requires a hexadecimal sequencer and a UUID document', () => {
    const badSequencer = {
      action: 'fail',
      ...versionReference,
      sequencer: 'xyz',
      code: 'no_text',
    };
    const longSequencer = {
      action: 'fail',
      ...versionReference,
      sequencer: 'a'.repeat(65),
      code: 'no_text',
    };
    const badDocument = { action: 'reindex', documentId: 'document-1' };

    for (const request of [badSequencer, longSequencer, badDocument]) {
      expect(controlSchema.safeParse(request).success).toBe(false);
    }
  });

  it('bounds completion counts and warnings', () => {
    const complete = {
      action: 'complete',
      ...versionReference,
      chunkCount: 1,
      characterCount: 1,
      pageCount: 1,
      embeddingTokens: 0,
      warnings: [],
    };
    const noChunks = { ...complete, chunkCount: 0 };
    const zeroPages = { ...complete, pageCount: 0 };
    const tooManyWarnings = {
      ...complete,
      warnings: Array.from({ length: 11 }, () => 'warning'),
    };

    expect(controlSchema.safeParse(complete).success).toBe(true);

    for (const request of [noChunks, zeroPages, tooManyWarnings]) {
      expect(controlSchema.safeParse(request).success).toBe(false);
    }
  });
});
