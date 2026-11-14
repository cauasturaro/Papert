import { SourceService } from '../../src/sources/application/source.service.js';
import type { SourceRepository } from '../../src/sources/domain/ports/source-repository.js';
import type { SourceStorage } from '../../src/sources/domain/ports/source-storage.js';
import type { StoredSource } from '../../src/sources/domain/source.js';

export const documentId = '11111111-1111-4111-8111-111111111111';
export const workspaceId = '22222222-2222-4222-8222-222222222222';
export const clock = new Date('2026-11-03T00:00:00Z');
export const key = `documents/${documentId}/original.pdf`;

export function storedSource(): StoredSource {
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

export function setup() {
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
