import { assertAttemptEligible } from '../domain/attempt-eligibility.js';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { FIXTURE_ID, fixtureDefinition } from '../domain/fixture.js';
import {
  filesSchema,
  roadmapSchema,
  stepSchema,
  StudyError,
} from '../domain/study.js';
import type { StudyRepository, WorkspaceChanges } from '../domain/study.js';

// shortcut: load full attempt history; paginate when histories become large.
const include = {
  roadmap: true,
  session: true,
  attempts: { orderBy: { createdAt: 'desc' } },
} as const;

type StoredWorkspace = Prisma.WorkspaceGetPayload<{ include: typeof include }>;
type StoredRoadmap = StoredWorkspace['roadmap'];
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
  if (!row.session) {
    throw new Error('Workspace study session is missing.');
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

export class PrismaStudyRepository implements StudyRepository {
  constructor(private readonly db: PrismaService) {}

  async fixture() {
    // Insert once; later application versions must not overwrite a student's roadmap.
    await this.db.roadmap.createMany({
      data: {
        id: FIXTURE_ID,
        authorName: 'Papert',
        definition: fixtureDefinition,
      },
      skipDuplicates: true,
    });

    const row = await this.db.roadmap.findUniqueOrThrow({
      where: { id: FIXTURE_ID },
    });

    return roadmap(row);
  }

  async start(userId: string, roadmapId: string) {
    const original = await this.db.roadmap.findUnique({
      where: { id: roadmapId },
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
    const row = await this.db.workspace.findFirst({
      where: { id, userId },
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
      if (!row) {
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
