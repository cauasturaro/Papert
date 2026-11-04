import type { Clock, IdGenerator } from '../../common/domain/runtime.js';
import type { z } from 'zod';
import { utcDayStart } from '../../common/domain/utc-day.js';
import { validate } from '../../common/domain/validation.js';
import type { SourceRepository, SourceStorage } from '../domain/ports.js';
import {
  beginDecision,
  MAX_DAILY_REGISTRATIONS,
  MAX_WORKSPACE_SOURCES,
  objectKey,
  parseObjectKey,
  registration,
  SourceError,
  UPLOAD_URL_SECONDS,
} from '../domain/source.js';
import {
  renditionPrefix,
  VIEW_URL_SECONDS,
  viewPlan,
} from '../domain/viewer.js';
import { contentTypeOf } from '../domain/source.js';
import { controlSchema, registerSchema } from './contracts.js';
import type { ControlRequest } from './contracts.js';
import { presentSource } from './presentation.js';

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
    await this.purge(deleted.id, deleted.objectKey);
  }

  async control(event: unknown) {
    const request: ControlRequest = parse(controlSchema, event);

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

    const pending = await this.repo.unpurged(20);
    let purged = 0;

    for (const source of pending) {
      const succeeded = await this.purge(source.id, source.objectKey);

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

  private async purge(id: string, key: string) {
    try {
      await this.storage.deleteAllVersions(key);
      await this.storage.deleteAllVersionsUnder(renditionPrefix(id));
      await this.repo.markPurged(id);

      return true;
    } catch {
      console.warn(JSON.stringify({ metric: 'source_purge_failure', id }));

      return false;
    }
  }
}
