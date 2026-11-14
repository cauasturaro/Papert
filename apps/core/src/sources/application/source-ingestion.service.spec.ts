import {
  setup,
  storedSource,
  documentId,
  workspaceId,
  clock,
  key,
} from '../../../test/support/source-service.js';
import { SourceIngestionService } from './source-ingestion.service.js';

function ingestionSetup() {
  const { repo, storage } = setup();
  const service = new SourceIngestionService(repo, storage, () => clock);

  return { repo, storage, service };
}

describe('SourceIngestionService', () => {
  it('uses the injected clock for maintenance', async () => {
    const { repo, service } = ingestionSetup();
    repo.expire.mockResolvedValue({ expired: 0, timedOut: 0 });
    repo.unpurged.mockResolvedValue([]);

    await service.maintenance();

    expect(repo.expire).toHaveBeenCalledWith(clock);
    expect(repo.unpurged).toHaveBeenCalledWith(20);
  });

  it('supplies the bucket-aware domain decision to the begin transaction', async () => {
    const { repo, service } = ingestionSetup();
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
    const { repo, service } = ingestionSetup();
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
    const { repo, service } = ingestionSetup();

    await expect(
      service.control({ action: 'complete', documentId }),
    ).rejects.toMatchObject({ kind: 'invalid' });

    expect(repo.complete).not.toHaveBeenCalled();
  });
});
