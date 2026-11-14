import type { Clock } from '../../common/domain/runtime.js';
import { validate } from '../../common/application/validation.js';
import type { SourceRepository } from '../domain/ports/source-repository.js';
import type { SourceStorage } from '../domain/ports/source-storage.js';
import {
  beginDecision,
  parseObjectKey,
  SourceError,
} from '../domain/source.js';
import { controlSchema } from './contracts/source.contract.js';
import { purgeSource } from './source-cleanup.js';

const PURGE_BATCH_SIZE = 20;

export class SourceIngestionService {
  constructor(
    private readonly repo: SourceRepository,
    private readonly storage: SourceStorage,
    private readonly now: Clock,
  ) {}

  async control(event: unknown) {
    const request = validate(
      controlSchema,
      event,
      () => new SourceError('invalid', 'Invalid source request.'),
    );

    if (request.action === 'begin') {
      return this.repo.begin(request, (source) =>
        beginDecision(source, request, this.storage.bucket),
      );
    }

    if (request.action === 'complete') {
      return this.repo.complete(request);
    }

    if (request.action === 'fail') {
      return this.repo.fail(request);
    }

    if (request.action === 'reindex') {
      return this.repo.reindex(request.documentId);
    }

    return this.removal(request.bucket, request.key);
  }

  async maintenance() {
    const { expired, timedOut } = await this.repo.expire(this.now());

    const pending = await this.repo.unpurged(PURGE_BATCH_SIZE);
    let purged = 0;

    for (const source of pending) {
      const succeeded = await purgeSource(
        this.repo,
        this.storage,
        source.id,
        source.objectKey,
      );

      if (succeeded) {
        purged += 1;
      }
    }

    return { expired, timedOut, purged, purgePending: pending.length - purged };
  }

  private async removal(bucket: string, key: string) {
    const parsed = parseObjectKey(key);

    const unknown = { documentId: null, workspaceId: null, deleted: false };

    if (bucket !== this.storage.bucket || !parsed) {
      return unknown;
    }

    const source = await this.repo.findByKey(key);
    if (!source) {
      return unknown;
    }

    return {
      documentId: source.id,
      workspaceId: source.workspaceId,
      deleted: source.status === 'deleted',
    };
  }
}
