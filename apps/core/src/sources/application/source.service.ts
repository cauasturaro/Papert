import { purgeSource } from './source-cleanup.js';
import type { Clock, IdGenerator } from '../../common/domain/runtime.js';
import type { z } from 'zod';
import { utcDayStart } from '../../common/domain/utc-day.js';
import { validate } from '../../common/application/validation.js';
import type { SourceRepository } from '../domain/ports/source-repository.js';
import type { SourceStorage } from '../domain/ports/source-storage.js';
import {
  MAX_DAILY_REGISTRATIONS,
  MAX_WORKSPACE_SOURCES,
  objectKey,
  registration,
  SourceError,
  UPLOAD_URL_SECONDS,
} from '../domain/source.js';
import { VIEW_URL_SECONDS, viewPlan } from '../domain/viewer.js';
import { contentTypeOf } from '../domain/source.js';
import { registerSchema } from './contracts/source.contract.js';
import { presentSource } from './source-presentation.js';

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  return validate(
    schema,
    value,
    () => new SourceError('invalid', 'Invalid source request.'),
  );
}

export class SourceService {
  constructor(
    private readonly repo: SourceRepository,
    private readonly storage: SourceStorage,
    private readonly now: Clock,
    private readonly generateId: IdGenerator,
  ) {}

  async register(userId: string, workspaceId: string, body: unknown) {
    const declared = registration(parse(registerSchema, body));

    const now = this.now();
    const id = this.generateId();
    const key = objectKey(id, declared.format);
    const uploadExpiresAt = new Date(now.getTime() + UPLOAD_URL_SECONDS * 1000);

    // The registration exists before any byte can produce an S3 event.
    const outcome = await this.repo.register(
      userId,
      workspaceId,
      {
        ...declared,
        id,
        bucket: this.storage.bucket,
        objectKey: key,
        uploadExpiresAt,
      },
      utcDayStart(now),
    );

    if (outcome.kind === 'workspace_not_found') {
      throw new SourceError('not_found', 'Workspace not found.');
    }

    if (outcome.kind === 'workspace_limit') {
      throw new SourceError(
        'conflict',
        `A workspace can hold up to ${MAX_WORKSPACE_SOURCES} sources. Delete one first.`,
      );
    }

    if (outcome.kind === 'daily_limit') {
      throw new SourceError(
        'rate_limited',
        `You can add up to ${MAX_DAILY_REGISTRATIONS} sources per day.`,
      );
    }

    const url = await this.storage.presignUpload(
      key,
      declared.contentType,
      declared.size,
      UPLOAD_URL_SECONDS,
    );

    return {
      source: presentSource(outcome.source, now),
      upload: {
        url,
        contentType: declared.contentType,
        expiresAt: uploadExpiresAt,
      },
    };
  }

  async list(userId: string, workspaceId: string) {
    const sources = await this.repo.list(userId, workspaceId);
    if (!sources) {
      throw new SourceError('not_found', 'Workspace not found.');
    }

    const now = this.now();

    return sources.map((source) => presentSource(source, now));
  }

  /** Ready sources the tutor may search; empty when the workspace is not the user's. */
  async readyForTutor(userId: string, workspaceId: string) {
    const sources = (await this.repo.list(userId, workspaceId)) ?? [];

    return sources
      .filter((source) => source.status === 'ready')
      .map((source) => ({
        id: source.id,
        filename: source.filename,
        format: source.format,
      }));
  }

  /** Fresh links to open a ready source; requires the same workspace authorization as listing. */
  async view(userId: string, workspaceId: string, sourceId: string) {
    const sources = await this.repo.list(userId, workspaceId);
    const source = sources?.find((item) => item.id === sourceId) ?? null;

    const plan = viewPlan(source);

    if (plan.kind === 'not_found') {
      throw new SourceError('not_found', 'Source not found.');
    }

    if (plan.kind === 'not_ready') {
      throw new SourceError(
        'conflict',
        'This source is not ready to open yet.',
      );
    }

    const opened = source!;
    const contentType = contentTypeOf(opened.format);
    const now = this.now();
    const link = {
      key: plan.key,
      versionId: plan.versionId,
      contentType,
      expiresInSeconds: VIEW_URL_SECONDS,
    };

    const original = await this.storage.presignDownload(link);
    const download = await this.storage.presignDownload({
      ...link,
      attachmentFilename: opened.filename,
    });

    let rendition = null;

    if (plan.renditionKey) {
      rendition = await this.storage.presignDownload({
        key: plan.renditionKey,
        contentType: 'application/json',
        expiresInSeconds: VIEW_URL_SECONDS,
      });
    }

    return {
      source: presentSource(opened, now),
      renderer: plan.renderer,
      versionId: plan.versionId,
      original,
      download,
      rendition,
      expiresAt: new Date(now.getTime() + VIEW_URL_SECONDS * 1000),
    };
  }

  async remove(userId: string, workspaceId: string, sourceId: string) {
    const deleted = await this.repo.markDeleted(userId, workspaceId, sourceId);
    if (!deleted) {
      throw new SourceError('not_found', 'Source not found.');
    }

    // The deletion is already authoritative; maintenance retries a failed purge.
    await purgeSource(this.repo, this.storage, deleted.id, deleted.objectKey);
  }
}
