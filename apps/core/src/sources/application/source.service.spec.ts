import {
  setup,
  storedSource,
  documentId,
  workspaceId,
  clock,
  key,
} from '../../../test/support/source-service.js';
import type { StoredSource } from '../domain/source.js';

describe('SourceService', () => {
  it('uses the injected ID and UTC clock for registration', async () => {
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
