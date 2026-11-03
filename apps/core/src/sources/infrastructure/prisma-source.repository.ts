import type { Prisma, SourceDocument } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type {
  NewSource,
  RegisterOutcome,
  SourceRepository,
} from '../domain/ports.js';
import {
  failureVerdict,
  processingDeadline,
  registrationLimit,
  reindexDecision,
  resultVerdict,
} from '../domain/source.js';
import type {
  beginDecision,
  BeginResult,
  Completion,
  Failure,
  ObjectEvent,
  ReindexResult,
  SourceFormat,
  SourceStatus,
  StoredSource,
} from '../domain/source.js';

type Transaction = Prisma.TransactionClient;

function stored(row: SourceDocument): StoredSource {
  const warnings = Array.isArray(row.warnings)
    ? row.warnings.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    bucket: row.bucket,
    objectKey: row.objectKey,
    filename: row.filename,
    format: row.format as SourceFormat,
    sizeBytes: row.sizeBytes,
    status: row.status as SourceStatus,
    objectVersionId: row.objectVersionId,
    sequencer: row.sequencer,
    errorCode: row.errorCode,
    chunkCount: row.chunkCount,
    characterCount: row.characterCount,
    pageCount: row.pageCount,
    warnings,
    uploadExpiresAt: row.uploadExpiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    readyAt: row.readyAt,
  };
}

async function lockByKey(tx: Transaction, key: string) {
  await tx.$queryRaw`
    SELECT id
    FROM core.source_document
    WHERE object_key = ${key}
    FOR UPDATE
  `;

  return tx.sourceDocument.findUnique({ where: { objectKey: key } });
}

async function lockById(tx: Transaction, id: string) {
  await tx.$queryRaw`
    SELECT id
    FROM core.source_document
    WHERE id = ${id}::uuid
    FOR UPDATE
  `;

  return tx.sourceDocument.findUnique({ where: { id } });
}

export class PrismaSourceRepository implements SourceRepository {
  constructor(private readonly db: PrismaService) {}

  async register(
    userId: string,
    workspaceId: string,
    source: NewSource,
    dayStart: Date,
  ): Promise<RegisterOutcome> {
    return this.db.$transaction(async (tx) => {
      // Serializes a user's registrations so both limits hold under concurrency.
      await tx.$queryRaw`
        SELECT id
        FROM core.app_user
        WHERE id = ${userId}::uuid
        FOR UPDATE
      `;

      const workspace = await tx.workspace.findFirst({
        where: { id: workspaceId, userId },
        select: { id: true },
      });

      if (!workspace) {
        return { kind: 'workspace_not_found' };
      }

      const active = await tx.sourceDocument.count({
        where: { workspaceId, status: { not: 'deleted' } },
      });
      const today = await tx.sourceDocument.count({
        where: { uploadedByUserId: userId, createdAt: { gte: dayStart } },
      });
      const breach = registrationLimit(active, today);

      if (breach === 'workspace_limit') {
        return { kind: 'workspace_limit' };
      }

      if (breach === 'daily_limit') {
        return { kind: 'daily_limit' };
      }

      const row = await tx.sourceDocument.create({
        data: {
          id: source.id,
          workspaceId,
          uploadedByUserId: userId,
          bucket: source.bucket,
          objectKey: source.objectKey,
          filename: source.filename,
          format: source.format,
          contentType: source.contentType,
          sizeBytes: source.size,
          uploadExpiresAt: source.uploadExpiresAt,
        },
      });

      return { kind: 'created', source: stored(row) };
    });
  }

  async list(userId: string, workspaceId: string) {
    const workspace = await this.db.workspace.findFirst({
      where: { id: workspaceId, userId },
      select: { id: true },
    });

    if (!workspace) {
      return null;
    }

    const rows = await this.db.sourceDocument.findMany({
      where: { workspaceId, status: { not: 'deleted' } },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(stored);
  }

  async markDeleted(userId: string, workspaceId: string, sourceId: string) {
    return this.db.$transaction(async (tx) => {
      const workspace = await tx.workspace.findFirst({
        where: { id: workspaceId, userId },
        select: { id: true },
      });

      if (!workspace) {
        return null;
      }

      const row = await lockById(tx, sourceId);

      if (!row || row.workspaceId !== workspaceId || row.status === 'deleted') {
        return null;
      }

      const now = new Date();
      const deleted = await tx.sourceDocument.update({
        where: { id: row.id },
        data: { status: 'deleted', deletedAt: now, updatedAt: now },
      });

      return stored(deleted);
    });
  }

  async markPurged(sourceId: string) {
    await this.db.sourceDocument.update({
      where: { id: sourceId },
      data: { purgedAt: new Date() },
    });
  }

  async begin(
    request: ObjectEvent,
    decide: (source: StoredSource | null) => ReturnType<typeof beginDecision>,
  ): Promise<BeginResult> {
    return this.db.$transaction(async (tx) => {
      const row = await lockByKey(tx, request.key);
      const decision = decide(row ? stored(row) : null);

      if (decision.kind === 'result') {
        return decision.result;
      }

      // Rows are guaranteed here: rejections for missing rows return above.
      const source = row!;
      const now = new Date();
      const version = {
        objectVersionId: request.versionId,
        sequencer: request.sequencer.toUpperCase(),
        updatedAt: now,
      };

      if (decision.kind === 'invalid') {
        await tx.sourceDocument.update({
          where: { id: source.id },
          data: {
            ...version,
            status: 'failed',
            errorCode: 'invalid_upload',
          },
        });

        return {
          outcome: 'invalid',
          reason: 'invalid_upload',
          documentId: source.id,
          workspaceId: source.workspaceId,
        };
      }

      await tx.sourceDocument.update({
        where: { id: source.id },
        data: {
          ...version,
          status: 'processing',
          errorCode: null,
          errorMessage: null,
        },
      });

      return {
        outcome: 'process',
        documentId: source.id,
        workspaceId: source.workspaceId,
        format: source.format as SourceFormat,
      };
    });
  }

  async complete(request: Completion) {
    return this.db.$transaction(async (tx) => {
      const row = await lockById(tx, request.documentId);
      const verdict = resultVerdict(row ? stored(row) : null, request);

      if (!verdict.accepted) {
        return verdict;
      }

      const now = new Date();
      await tx.sourceDocument.update({
        where: { id: request.documentId },
        data: {
          status: 'ready',
          errorCode: null,
          errorMessage: null,
          chunkCount: request.chunkCount,
          characterCount: request.characterCount,
          pageCount: request.pageCount,
          embeddingTokens: request.embeddingTokens,
          warnings: request.warnings,
          readyAt: now,
          updatedAt: now,
        },
      });

      return verdict;
    });
  }

  async fail(request: Failure) {
    return this.db.$transaction(async (tx) => {
      const row = await lockById(tx, request.documentId);
      const verdict = failureVerdict(row ? stored(row) : null, request);

      if (!verdict.accepted) {
        return verdict;
      }

      await tx.sourceDocument.update({
        where: { id: request.documentId },
        data: {
          status: 'failed',
          errorCode: request.code,
          updatedAt: new Date(),
        },
      });

      return verdict;
    });
  }

  async reindex(documentId: string): Promise<ReindexResult> {
    return this.db.$transaction(async (tx) => {
      const row = await lockById(tx, documentId);
      const decision = reindexDecision(row ? stored(row) : null);

      // The decision guarantees a row with a recorded object version.
      if (!decision.reindex || !row?.objectVersionId || !row.sequencer) {
        return { outcome: 'skip', reason: decision.reason ?? 'no_object' };
      }

      await tx.sourceDocument.update({
        where: { id: row.id },
        data: {
          status: 'processing',
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date(),
        },
      });

      return {
        outcome: 'process',
        documentId: row.id,
        workspaceId: row.workspaceId,
        format: row.format as SourceFormat,
        bucket: row.bucket,
        key: row.objectKey,
        versionId: row.objectVersionId,
        sequencer: row.sequencer,
      };
    });
  }

  async findByKey(key: string) {
    const row = await this.db.sourceDocument.findUnique({
      where: { objectKey: key },
    });

    return row ? stored(row) : null;
  }

  async expire(now: Date) {
    const expired = await this.db.sourceDocument.updateMany({
      where: { status: 'awaiting_upload', uploadExpiresAt: { lt: now } },
      data: { status: 'failed', errorCode: 'upload_expired', updatedAt: now },
    });

    const timedOut = await this.db.sourceDocument.updateMany({
      where: {
        status: 'processing',
        updatedAt: { lt: processingDeadline(now) },
      },
      data: {
        status: 'failed',
        errorCode: 'processing_timeout',
        updatedAt: now,
      },
    });

    return { expired: expired.count, timedOut: timedOut.count };
  }

  async unpurged(limit: number) {
    const rows = await this.db.sourceDocument.findMany({
      where: { status: 'deleted', purgedAt: null },
      orderBy: { deletedAt: 'asc' },
      take: limit,
    });

    return rows.map(stored);
  }
}
