import {
  beginDecision,
  compareSequencers,
  MAX_SOURCE_BYTES,
  objectKey,
  parseObjectKey,
  registration,
  SourceError,
} from './source.js';
import { registrationLimit, reindexDecision, resultVerdict } from './source.js';
import type { ObjectEvent, StoredSource } from './source.js';

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

function begin(overrides: Partial<ObjectEvent> = {}): ObjectEvent {
  return {
    bucket: 'papert-sources',
    key: objectKey(id, 'pdf'),
    versionId: 'v2',
    sequencer: '0000065F5E42536A55',
    size: 100,
    ...overrides,
  };
}

describe('source registration', () => {
  it('derives the format from the extension and normalizes content types', () => {
    const markdown = registration({
      filename: 'notes.MD',
      contentType: '',
      size: 10,
    });
    const docx = registration({
      filename: 'paper.docx',
      contentType: 'application/octet-stream',
      size: 10,
    });

    expect(markdown).toMatchObject({
      format: 'md',
      contentType: 'text/markdown',
    });
    expect(docx.format).toBe('docx');
  });

  it('rejects unsupported, mismatched and oversized declarations', () => {
    const cases = [
      { filename: 'image.png', contentType: 'image/png', size: 10 },
      { filename: 'noextension', contentType: '', size: 10 },
      { filename: 'paper.pdf', contentType: 'text/html', size: 10 },
      {
        filename: 'paper.pdf',
        contentType: 'application/pdf',
        size: MAX_SOURCE_BYTES + 1,
      },
    ];

    for (const body of cases) {
      expect(() => registration(body)).toThrow(SourceError);
    }
  });
});

describe('object keys and sequencers', () => {
  it('parses only Core-issued keys', () => {
    expect(parseObjectKey(objectKey(id, 'docx'))).toEqual({
      documentId: id,
      format: 'docx',
    });
    expect(parseObjectKey(`documents/${id}/original.exe`)).toBeNull();
    expect(parseObjectKey(`documents/${id}/../other/original.pdf`)).toBeNull();
    expect(parseObjectKey('uploads/original.pdf')).toBeNull();
  });

  it('compares hexadecimal sequencers after left padding', () => {
    expect(compareSequencers('0055', '0055')).toBe(0);
    expect(compareSequencers('F', '10')).toBe(-1);
    expect(compareSequencers('a', '000A')).toBe(0);
    expect(compareSequencers('0055', '00550')).toBe(-1);
    expect(compareSequencers('0056', '00551')).toBe(-1);
    expect(compareSequencers('00a1', '00B0')).toBe(-1);
  });
});

describe('begin decisions', () => {
  it('accepts a newer upload across a hexadecimal length boundary', () => {
    const decision = beginDecision(
      source({ status: 'ready', objectVersionId: 'old', sequencer: 'F' }),
      begin({ versionId: 'new', sequencer: '10' }),
      'papert-sources',
    );

    expect(decision).toEqual({ kind: 'process' });
  });

  it('rejects foreign buckets, forged keys and unregistered documents', () => {
    const foreignBucket = beginDecision(
      source(),
      begin({ bucket: 'other' }),
      'papert-sources',
    );
    const unregistered = beginDecision(null, begin(), 'papert-sources');
    const otherFormat = beginDecision(
      source({ format: 'md' }),
      begin(),
      'papert-sources',
    );

    expect(foreignBucket).toMatchObject({ result: { outcome: 'reject' } });
    expect(unregistered).toMatchObject({ result: { reason: 'unregistered' } });
    expect(otherFormat).toMatchObject({ result: { reason: 'unregistered' } });
  });

  it('orders versions and retries only the current unfinished version', () => {
    const current = {
      objectVersionId: 'v2',
      sequencer: '0000065F5E42536A55',
    };

    const older = beginDecision(
      source({ ...current, status: 'processing' }),
      begin({ versionId: 'v1', sequencer: '0000065F5E42438E20' }),
      'papert-sources',
    );
    const retry = beginDecision(
      source({ ...current, status: 'processing' }),
      begin(),
      'papert-sources',
    );
    const finished = beginDecision(
      source({ ...current, status: 'ready' }),
      begin(),
      'papert-sources',
    );
    const newer = beginDecision(
      source({ ...current, status: 'ready' }),
      begin({ versionId: 'v3', sequencer: '0000065F5E42606EA9' }),
      'papert-sources',
    );

    expect(older).toMatchObject({ result: { outcome: 'stale' } });
    expect(retry).toEqual({ kind: 'process' });
    expect(finished).toMatchObject({ result: { outcome: 'duplicate' } });
    expect(newer).toEqual({ kind: 'process' });
  });

  it('never processes deleted documents or objects of another size', () => {
    const deleted = beginDecision(
      source({ status: 'deleted' }),
      begin(),
      'papert-sources',
    );
    const resized = beginDecision(
      source(),
      begin({ size: 101 }),
      'papert-sources',
    );

    expect(deleted).toMatchObject({ result: { outcome: 'deleted' } });
    expect(resized).toEqual({ kind: 'invalid' });
  });
});

describe('rules that guard state transitions', () => {
  const version = {
    documentId: id,
    versionId: 'v2',
    sequencer: '00B2',
  };
  const current = { objectVersionId: 'v2', sequencer: '00b2' };

  it('accepts results only for the current version of an open document', () => {
    const processing = resultVerdict(
      source({ ...current, status: 'processing' }),
      version,
    );
    const otherVersion = resultVerdict(
      source({ ...current, status: 'processing' }),
      { ...version, versionId: 'v1' },
    );
    const deleted = resultVerdict(source({ status: 'deleted' }), version);
    const missing = resultVerdict(null, version);

    expect(processing).toEqual({ accepted: true, deleted: false });
    expect(otherVersion).toEqual({ accepted: false, deleted: false });
    expect(deleted).toEqual({ accepted: false, deleted: true });
    expect(missing).toEqual({ accepted: false, deleted: false });
  });

  it('never downgrades a ready version with a late failure', () => {
    const ready = source({ ...current, status: 'ready' });

    expect(resultVerdict(ready, version).accepted).toBe(false);
    expect(
      resultVerdict(source({ ...current, status: 'failed' }), version).accepted,
    ).toBe(true);
  });

  it('reindexes resumable documents whose upload was valid', () => {
    const ready = reindexDecision(source({ ...current, status: 'ready' }));
    const pending = reindexDecision(source());
    const invalid = reindexDecision(
      source({ ...current, status: 'failed', errorCode: 'invalid_upload' }),
    );
    const noText = reindexDecision(
      source({ ...current, status: 'failed', errorCode: 'no_text' }),
    );

    expect(ready.reindex).toBe(true);
    expect(
      reindexDecision(source({ ...current, status: 'processing' })).reindex,
    ).toBe(true);
    expect(pending).toEqual({ reindex: false, reason: 'no_object' });
    expect(invalid.reindex).toBe(false);
    expect(noText.reindex).toBe(true);
  });

  it('applies the workspace limit before the daily limit', () => {
    expect(registrationLimit(19, 29)).toBeNull();
    expect(registrationLimit(20, 0)).toBe('workspace_limit');
    expect(registrationLimit(3, 30)).toBe('daily_limit');
  });
});
