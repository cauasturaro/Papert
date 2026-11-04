import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { RoadmapDraftRepository } from '../domain/draft-ports.js';
import {
  assertDiscardAllowed,
  assertDraftCapacity,
} from '../domain/roadmap-draft.js';
import type {
  DraftOutcome,
  DraftStatus,
  RoadmapDraft,
} from '../domain/roadmap-draft.js';
import { levelSchema, roadmapSchema } from '../domain/study.js';
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

      const discarded = await tx.roadmapDraft.update({
        where: { workspaceId },
        data: { status: 'discarded', updatedAt: new Date() },
        include,
      });

      return draftRecord(discarded);
    });
  }
}
