import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type { RoadmapDraftRepository } from '../domain/ports/roadmap-draft-repository.js';
import {
  assertDiscardAllowed,
  assertDraftCapacity,
} from '../domain/roadmap-draft.js';
import type {
  DraftOutcome,
  DraftStatus,
  RoadmapDraft,
} from '../domain/roadmap-draft.js';
import {
  levelSchema,
  roadmapSchema,
} from '../application/contracts/study.contract.js';
import { parseStoredRecommendation } from '../application/contracts/recommendation.contract.js';
import { assertDeclineAllowed } from '../domain/draft-recommendation.js';
import type { Level } from '../domain/study.js';

const include = { workspace: { include: { roadmap: true } } } as const;

type StoredDraft = Prisma.RoadmapDraftGetPayload<{ include: typeof include }>;

export function draftRecord(row: StoredDraft): RoadmapDraft {
  const stored = row.workspace.roadmap;
  let roadmap = null;

  if (stored) {
    roadmap = {
      id: stored.id,
      authorName: stored.authorName,
      authorUserId: stored.authorUserId,
      definition: roadmapSchema.parse(stored.definition),
    };
  }

  return {
    workspaceId: row.workspaceId,
    goal: row.goal,
    level: levelSchema.parse(row.level),
    status: row.status as DraftStatus,
    executionId: row.executionId,
    outcome: row.outcome as DraftOutcome | null,
    recommendation: parseStoredRecommendation(row.recommendation),
    roadmap,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Same statuses as activeDraft(); a query filter cannot call the domain function.
const ACTIVE_STATUSES: DraftStatus[] = ['open', 'failed', 'generating'];

export class PrismaRoadmapDrafts implements RoadmapDraftRepository {
  constructor(private readonly db: PrismaService) {}

  async create(userId: string, request: { goal: string; level: Level }) {
    return this.db.$transaction(async (tx) => {
      // The user lock serializes concurrent creations against the active-draft limit.
      await tx.$queryRaw`SELECT id FROM core.app_user WHERE id = ${userId}::uuid FOR UPDATE`;

      const active = await tx.roadmapDraft.count({
        where: { userId, status: { in: ACTIVE_STATUSES } },
      });
      assertDraftCapacity(active);

      // No roadmap yet; it is bound after generation.
      const workspace = await tx.workspace.create({
        data: { userId, files: {} },
      });

      await tx.studySession.create({ data: { workspaceId: workspace.id } });

      const created = await tx.roadmapDraft.create({
        data: {
          workspaceId: workspace.id,
          userId,
          goal: request.goal,
          level: request.level,
        },
        include,
      });

      return draftRecord(created);
    });
  }

  async list(userId: string) {
    const rows = await this.db.roadmapDraft.findMany({
      where: { userId, status: { in: ACTIVE_STATUSES } },
      include,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(draftRecord);
  }

  async find(userId: string, workspaceId: string) {
    const row = await this.db.roadmapDraft.findFirst({
      where: { workspaceId, userId },
      include,
    });

    return row ? draftRecord(row) : null;
  }

  async byRoadmap(userId: string, roadmapId: string) {
    const row = await this.db.roadmapDraft.findFirst({
      where: { userId, workspace: { roadmapId } },
      include,
    });

    return row ? draftRecord(row) : null;
  }

  async declineRecommendation(userId: string, workspaceId: string) {
    return this.db.$transaction(async (tx) => {
      // Same lock as admissions, so a decline cannot race a new check or a generation.
      await tx.$queryRaw`
        SELECT id
        FROM core.workspace
        WHERE id = ${workspaceId}::uuid
          AND user_id = ${userId}::uuid
        FOR UPDATE
      `;

      const row = await tx.roadmapDraft.findFirst({
        where: { workspaceId, userId },
      });
      const status = (row?.status as DraftStatus | undefined) ?? null;
      const recommendation = parseStoredRecommendation(row?.recommendation);

      assertDeclineAllowed(status, recommendation);

      const declined = await tx.roadmapDraft.update({
        where: { workspaceId },
        data: {
          recommendation: { ...recommendation, declined: true },
          updatedAt: new Date(),
        },
        include,
      });

      return draftRecord(declined);
    });
  }

  async discard(userId: string, workspaceId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM core.workspace
        WHERE id = ${workspaceId}::uuid
          AND user_id = ${userId}::uuid
        FOR UPDATE
      `;

      const row = await tx.roadmapDraft.findFirst({
        where: { workspaceId, userId },
      });
      assertDiscardAllowed((row?.status as DraftStatus | undefined) ?? null);

      const now = new Date();

      // Source maintenance can finish physical purging even if this process stops.
      await tx.sourceDocument.updateMany({
        where: { workspaceId, status: { not: 'deleted' } },
        data: { status: 'deleted', deletedAt: now, updatedAt: now },
      });

      const discarded = await tx.roadmapDraft.update({
        where: { workspaceId },
        data: { status: 'discarded', updatedAt: now },
        include,
      });

      return draftRecord(discarded);
    });
  }
}
