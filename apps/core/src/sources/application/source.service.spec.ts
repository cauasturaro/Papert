import { SourceService } from './source.service.js';
import type { SourceRepository } from '../domain/ports/source-repository.js';
import type { SourceStorage } from '../domain/ports/source-storage.js';
import type { StoredSource } from '../domain/source.js';

const documentId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const clock = new Date('2026-11-03T00:00:00Z');
const key = `documents/${documentId}/original.pdf`;

function storedSource(): StoredSource {
  const now = clock;

  return {
    id: documentId,
    workspaceId,
    bucket: 'sources',
    objectKey: key,
    filename: 'guide.pdf',
    format: 'pdf',
    sizeBytes: 10,
    status: 'awaiting_upload',
    objectVersionId: null,
    sequencer: null,
    errorCode: null,
    chunkCount: null,
    characterCount: null,
    pageCount: null,
    warnings: [],
    uploadExpiresAt: new Date(now.getTime() + 600_000),
    createdAt: now,
    updatedAt: now,
    readyAt: null,
  };
}

function setup() {
  const repo = {
    register: vi.fn<SourceRepository['register']>(),
    list: vi.fn<SourceRepository['list']>(),
    markDeleted: vi.fn<SourceRepository['markDeleted']>(),
    markPurged: vi.fn<SourceRepository['markPurged']>(),
    begin: vi.fn<SourceRepository['begin']>(),
    complete: vi.fn<SourceRepository['complete']>(),
    fail: vi.fn<SourceRepository['fail']>(),
    findByKey: vi.fn<SourceRepository['findByKey']>(),
    reindex: vi.fn<SourceRepository['reindex']>(),
    expire: vi.fn<SourceRepository['expire']>(),
    unpurged: vi.fn<SourceRepository['unpurged']>(),
  };
  const storage = {
    bucket: 'sources',
    presignUpload: vi.fn<SourceStorage['presignUpload']>(),
    deleteAllVersions: vi.fn<SourceStorage['deleteAllVersions']>(),
    deleteAllVersionsUnder: vi.fn<SourceStorage['deleteAllVersionsUnder']>(),
    presignDownload: vi
      .fn<SourceStorage['presignDownload']>()
      .mockImplementation(async (request) =>
        request.attachmentFilename
          ? `https://storage/download/${request.key}`
          : `https://storage/view/${request.key}`,
      ),
  };
  const service = new SourceService(
    repo,
    storage,
    () => clock,
    () => documentId,
  );

  return { repo, storage, service };
}

describe('SourceService', () => {
  it('uses the injected ID and UTC clock for registration and maintenance', async () => {
    const { repo, storage, service } = setup();
    repo.register.mockResolvedValue({
      kind: 'created',
      source: storedSource(),
    });
    storage.presignUpload.mockResolvedValue('https://upload.example');
    const declaration = {
      filename: 'guide.pdf',
      contentType: 'application/pdf',
      size: 10,
    };

    const result = await service.register('user', workspaceId, declaration);

    expect(repo.register).toHaveBeenCalledWith(
      'user',
      workspaceId,
      expect.objectContaining({
        id: documentId,
        objectKey: key,
        uploadExpiresAt: new Date(clock.getTime() + 600_000),
      }),
      clock,
    );
    expect(result.upload.expiresAt).toEqual(
      new Date(clock.getTime() + 600_000),
    );

    repo.expire.mockResolvedValue({ expired: 0, timedOut: 0 });
    repo.unpurged.mockResolvedValue([]);

    await service.maintenance();

    expect(repo.expire).toHaveBeenCalledWith(clock);
  });

  it.each([
    ['workspace_not_found', 'not_found', 'Workspace not found.'],
    [
      'workspace_limit',
      'conflict',
      'A workspace can hold up to 20 sources. Delete one first.',
    ],
    ['daily_limit', 'rate_limited', 'You can add up to 30 sources per day.'],
  ] as const)(
    'rejects %s before granting an upload',
    async (outcome, kind, message) => {
      const { repo, storage, service } = setup();
      repo.register.mockResolvedValue({ kind: outcome });
      const declaration = {
        filename: 'guide.pdf',
        contentType: 'application/pdf',
        size: 10,
      };

      await expect(
        service.register('user', workspaceId, declaration),
      ).rejects.toMatchObject({ kind, message });

      expect(storage.presignUpload).not.toHaveBeenCalled();
    },
  );

  it('persists registration before presigning and returns a semantic grant', async () => {
    const { repo, storage, service } = setup();
    repo.register.mockResolvedValue({
      kind: 'created',
      source: storedSource(),
    });
    storage.presignUpload.mockResolvedValue('https://storage/upload');
    const declaration = {
      filename: 'guide.pdf',
      contentType: 'application/pdf',
      size: 10,
    };

    const grant = await service.register('user', workspaceId, declaration);

    expect(repo.register.mock.invocationCallOrder[0]).toBeLessThan(
      storage.presignUpload.mock.invocationCallOrder[0],
    );
    expect(storage.presignUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^documents\/.+\/original.pdf$/),
      'application/pdf',
      10,
      600,
    );
    expect(grant.upload).toEqual({
      url: 'https://storage/upload',
      contentType: 'application/pdf',
      expiresAt: expect.any(Date),
    });
    expect(grant.upload).not.toHaveProperty('method');
  });

  it('supplies the bucket-aware domain decision to the begin transaction', async () => {
    const { repo, service } = setup();
    const event = {
      action: 'begin',
      bucket: 'sources',
      key,
      versionId: 'v1',
      sequencer: 'A',
      size: 10,
    };
    const result = {
      outcome: 'process',
      documentId,
      workspaceId,
      format: 'pdf',
    } as const;
    repo.begin.mockResolvedValue(result);

    const verdict = await service.control(event);
    const [request, decide] = repo.begin.mock.calls[0];

    expect(verdict).toEqual(result);
    expect(request).toEqual(event);
    expect(decide(storedSource())).toEqual({ kind: 'process' });
    expect(decide(null)).toEqual({
      kind: 'result',
      result: { outcome: 'reject', reason: 'unregistered' },
    });
    expect(decide({ ...storedSource(), status: 'deleted' })).toMatchObject({
      kind: 'result',
      result: { outcome: 'deleted' },
    });
    expect(decide({ ...storedSource(), sizeBytes: 11 })).toEqual({
      kind: 'invalid',
    });
  });

  it.each([
    { accepted: true, deleted: false },
    { accepted: false, deleted: false },
    { accepted: false, deleted: true },
  ])('preserves complete and fail verdicts: %j', async (verdict) => {
    const { repo, service } = setup();
    const version = { documentId, versionId: 'v1', sequencer: 'A' };
    const completion = {
      action: 'complete',
      ...version,
      chunkCount: 1,
      characterCount: 10,
      pageCount: null,
      embeddingTokens: 3,
      warnings: [],
    };
    const failure = { action: 'fail', ...version, code: 'no_text' };
    repo.complete.mockResolvedValue(verdict);
    repo.fail.mockResolvedValue(verdict);

    const completed = await service.control(completion);
    const failed = await service.control(failure);

    expect(completed).toEqual(verdict);
    expect(failed).toEqual(verdict);
    expect(repo.complete).toHaveBeenCalledWith(completion);
    expect(repo.fail).toHaveBeenCalledWith(failure);
  });

  it('rejects invalid control payloads before persistence', async () => {
    const { repo, service } = setup();

    await expect(
      service.control({ action: 'complete', documentId }),
    ).rejects.toMatchObject({ kind: 'invalid' });

    expect(repo.complete).not.toHaveBeenCalled();
  });

  it('marks Core deleted before deleting storage, then records the purge', async () => {
    const { repo, storage, service } = setup();
    repo.markDeleted.mockResolvedValue(storedSource());

    await service.remove('user', workspaceId, documentId);

    expect(repo.markDeleted).toHaveBeenCalledWith(
      'user',
      workspaceId,
      documentId,
    );
    expect(storage.deleteAllVersions).toHaveBeenCalledWith(key);
    expect(storage.deleteAllVersionsUnder).toHaveBeenCalledWith(
      `renditions/${documentId}/`,
    );
    expect(repo.markPurged).toHaveBeenCalledWith(documentId);
    expect(repo.markDeleted.mock.invocationCallOrder[0]).toBeLessThan(
      storage.deleteAllVersions.mock.invocationCallOrder[0],
    );
    expect(storage.deleteAllVersions.mock.invocationCallOrder[0]).toBeLessThan(
      repo.markPurged.mock.invocationCallOrder[0],
    );
  });

  it('leaves a failed storage purge pending for maintenance', async () => {
    const { repo, storage, service } = setup();
    repo.markDeleted.mockResolvedValue(storedSource());
    storage.deleteAllVersions.mockRejectedValue(
      new Error('Storage unavailable'),
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await service.remove('user', workspaceId, documentId);

      expect(repo.markPurged).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it('does not touch storage when Core cannot find the source', async () => {
    const { repo, storage, service } = setup();
    repo.markDeleted.mockResolvedValue(null);

    await expect(
      service.remove('user', workspaceId, documentId),
    ).rejects.toMatchObject({
      kind: 'not_found',
      message: 'Source not found.',
    });

    expect(storage.deleteAllVersions).not.toHaveBeenCalled();
  });

  describe('view', () => {
    const docxKey = `documents/${documentId}/original.docx`;
    const ready: StoredSource = {
      ...storedSource(),
      objectKey: docxKey,
      filename: 'notes.docx',
      format: 'docx',
      status: 'ready',
      objectVersionId: 'version-2',
    };

    it('issues version-pinned links and the rendition of the current version', async () => {
      const { repo, storage, service } = setup();
      repo.list.mockResolvedValue([ready]);

      const view = await service.view('user', workspaceId, documentId);

      expect(repo.list).toHaveBeenCalledWith('user', workspaceId);
      expect(view.renderer).toBe('paragraphs');
      expect(view.original).toBe(`https://storage/view/${docxKey}`);
      expect(view.download).toBe(`https://storage/download/${docxKey}`);
      expect(view.rendition).toBe(
        `https://storage/view/renditions/${documentId}/version-2.json`,
      );
      expect(storage.presignDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          key: docxKey,
          versionId: 'version-2',
          expiresInSeconds: 300,
        }),
      );
    });

    it('denies other workspaces, deleted and unfinished sources', async () => {
      const { repo, storage, service } = setup();

      repo.list.mockResolvedValueOnce(null);
      const foreign = service.view('intruder', workspaceId, documentId);

      repo.list.mockResolvedValueOnce([]);
      const deleted = service.view('user', workspaceId, documentId);

      repo.list.mockResolvedValueOnce([{ ...ready, status: 'processing' }]);
      const processing = service.view('user', workspaceId, documentId);

      await expect(foreign).rejects.toMatchObject({ kind: 'not_found' });
      await expect(deleted).rejects.toMatchObject({ kind: 'not_found' });
      await expect(processing).rejects.toMatchObject({ kind: 'conflict' });
      expect(storage.presignDownload).not.toHaveBeenCalled();
    });
  });
});
