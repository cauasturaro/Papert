import { assertAttemptEligible } from '../domain/attempt-eligibility.js';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  DEFAULT_ROADMAP_ID,
  defaultRoadmapDefinition,
} from '../domain/default-roadmap.js';
import {
  filesSchema,
  roadmapSchema,
  stepSchema,
} from '../application/contracts/study.contract.js';
import { StudyError } from '../domain/study.js';
import type { StudyRepository } from '../domain/ports/study-repository.js';
import type { WorkspaceChanges } from '../domain/study.js';

// shortcut: load full attempt history; paginate when histories become large.
const include = {
  roadmap: true,
  session: true,
  attempts: { orderBy: { createdAt: 'desc' } },
} as const;

type StoredWorkspace = Prisma.WorkspaceGetPayload<{ include: typeof include }>;
type StoredRoadmap = NonNullable<StoredWorkspace['roadmap']>;
type StoredAttempt = StoredWorkspace['attempts'][number];

function roadmap(row: StoredRoadmap) {
  return {
    id: row.id,
    authorName: row.authorName,
    authorUserId: row.authorUserId,
    definition: roadmapSchema.parse(row.definition),
  };
}

function attempt(row: StoredAttempt) {
  return {
    ...row,
    files: filesSchema.parse(row.files),
    challenge: stepSchema.shape.challenge.parse(row.challenge),
  };
}

function workspace(row: StoredWorkspace) {
  if (!row.session || !row.roadmap) {
    throw new Error('Workspace study session or roadmap is missing.');
  }

  return {
    id: row.id,
    roadmap: roadmap(row.roadmap),
    currentStep: row.currentStep,
    revision: row.revision,
    notes: row.notes,
    files: filesSchema.parse(row.files),
    session: row.session,
    attempts: row.attempts.map(attempt),
  };
}

// Papert's roadmaps and the ones this learner generated.
function visibleTo(userId: string) {
  return { OR: [{ authorUserId: null }, { authorUserId: userId }] };
}

export class PrismaStudyRepository implements StudyRepository {
  constructor(private readonly db: PrismaService) {}

  async fixture() {
    // Insert once; later application versions must not overwrite a student's roadmap.
    await this.db.roadmap.createMany({
      data: {
        id: DEFAULT_ROADMAP_ID,
        authorName: 'Papert',
        definition: defaultRoadmapDefinition,
      },
      skipDuplicates: true,
    });

    const row = await this.db.roadmap.findUniqueOrThrow({
      where: { id: DEFAULT_ROADMAP_ID },
    });

    return roadmap(row);
  }

  async roadmaps(userId: string) {
    await this.fixture();

    const rows = await this.db.roadmap.findMany({
      where: visibleTo(userId),
      include: {
        workspaces: {
          where: { userId },
          select: { id: true, currentStep: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      roadmap: roadmap(row),
      workspace: row.workspaces[0] ?? null,
    }));
  }

  async start(userId: string, roadmapId: string) {
    const original = await this.db.roadmap.findFirst({
      where: { id: roadmapId, ...visibleTo(userId) },
    });
    if (!original) {
      return null;
    }

    const definition = roadmapSchema.parse(original.definition);

    return this.db.$transaction(async (tx) => {
      await tx.workspace.createMany({
        data: { userId, roadmapId, files: definition.starterFiles },
        skipDuplicates: true,
      });

      const row = await tx.workspace.findUniqueOrThrow({
        where: { userId_roadmapId: { userId, roadmapId } },
      });

      await tx.studySession.upsert({
        where: { workspaceId: row.id },
        create: { workspaceId: row.id },
        update: { lastOpenedAt: new Date() },
      });

      const resumed = await tx.workspace.findUniqueOrThrow({
        where: { id: row.id },
        include,
      });

      return workspace(resumed);
    });
  }

  async workspace(userId: string, id: string) {
    // A preparation workspace becomes studyable only once its roadmap is bound.
    const row = await this.db.workspace.findFirst({
      where: { id, userId, roadmapId: { not: null } },
      include,
    });

    return row ? workspace(row) : null;
  }

  async save(userId: string, id: string, changes: WorkspaceChanges) {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.workspace.updateMany({
        where: { id, userId, revision: changes.revision },
        data: {
          notes: changes.notes,
          files: changes.files,
          revision: { increment: 1 },
        },
      });
      if (count === 0) {
        return null;
      }

      const saved = await tx.workspace.findUniqueOrThrow({
        where: { id },
        include,
      });

      return workspace(saved);
    });
  }

  async recordAttempt(
    userId: string,
    id: string,
    revision: number,
    stepId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      // Serialize snapshots with saves so criteria and code belong to the same revision.
      await tx.$queryRaw`
        SELECT id
        FROM core.workspace
        WHERE id = ${id}::uuid
          AND user_id = ${userId}::uuid
        FOR UPDATE
      `;

      const row = await tx.workspace.findFirst({
        where: { id, userId },
        include: { roadmap: true },
      });
      if (!row?.roadmap) {
        throw new StudyError('not_found', 'Workspace not found.');
      }

      if (row.revision !== revision) {
        throw new StudyError(
          'conflict',
          'Save or reload the current workspace before recording an attempt.',
        );
      }

      const step = roadmapSchema.parse(row.roadmap.definition).steps[
        row.currentStep
      ];
      assertAttemptEligible(step, stepId);

      const saved = await tx.studyAttempt.upsert({
        where: {
          workspaceId_revision_stepId: { workspaceId: id, revision, stepId },
        },
        create: {
          workspaceId: id,
          stepId,
          revision,
          files: row.files as Prisma.InputJsonValue,
          challenge: step.challenge,
        },
        update: {},
      });

      return attempt(saved);
    });
  }
}
