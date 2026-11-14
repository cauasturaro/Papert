import { assertAttemptEligible } from '../domain/attempt-eligibility.js';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import {
  DEFAULT_ROADMAP_ID,
  defaultRoadmapDefinition,
} from '../domain/default-roadmap.js';
import { SHOWCASE_ROADMAPS } from '../domain/showcase-roadmaps.js';
import { roadmapSchema } from '../application/contracts/study.contract.js';
import { progressStepIndex, StudyError } from '../domain/study.js';
import { solutionProgress } from '../domain/solution-progress.js';
import type { StudyRepository } from '../domain/ports/study-repository.js';
import type { WorkspaceChanges } from '../domain/study.js';
import {
  attemptSummarySelect,
  newestFirst,
  toAttempt,
  toAttemptSummary,
  toRoadmap,
  toWorkspace,
  workspaceInclude,
} from './study-rows.js';
import type { StoredRoadmap } from './study-rows.js';

function latest(...moments: (Date | null | undefined)[]) {
  const times = moments.flatMap((moment) => (moment ? [moment.getTime()] : []));

  return new Date(Math.max(...times));
}

// Papert's roadmaps, the learner's own and any roadmap they already study.
function startableBy(userId: string) {
  return {
    OR: [
      { authorUserId: null },
      { authorUserId: userId },
      { workspaces: { some: { userId } } },
    ],
  };
}

// The study home: what the learner generated or started; the catalog lists the rest.
function studiedBy(userId: string) {
  return {
    OR: [{ authorUserId: userId }, { workspaces: { some: { userId } } }],
  };
}

const PAPERT_ROADMAPS = [
  { id: DEFAULT_ROADMAP_ID, definition: defaultRoadmapDefinition },
  ...SHOWCASE_ROADMAPS,
];

export class PrismaStudyRepository implements StudyRepository {
  constructor(private readonly db: PrismaService) {}

  async fixture() {
    await this.ensurePapertRoadmaps();

    const row = await this.db.roadmap.findUniqueOrThrow({
      where: { id: DEFAULT_ROADMAP_ID },
    });

    return toRoadmap(row);
  }

  async papertRoadmaps() {
    await this.ensurePapertRoadmaps();

    const rows = await this.db.roadmap.findMany({
      where: { id: { in: PAPERT_ROADMAPS.map((item) => item.id) } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toRoadmap);
  }

  async findMany(ids: string[]) {
    const rows = await this.db.roadmap.findMany({
      where: { id: { in: ids } },
    });

    return rows.map(toRoadmap);
  }

  async startedOf(userId: string, roadmapIds: string[]) {
    const rows = await this.db.workspace.findMany({
      where: { userId, roadmapId: { in: roadmapIds } },
      select: { roadmapId: true },
    });

    return rows.flatMap((row) => (row.roadmapId ? [row.roadmapId] : []));
  }

  async roadmaps(userId: string) {
    const rows = await this.db.roadmap.findMany({
      where: studiedBy(userId),
      include: {
        workspaces: {
          where: { userId },
          select: {
            id: true,
            currentStep: true,
            createdAt: true,
            session: { select: { lastOpenedAt: true } },
            attempts: {
              select: { createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            executions: {
              select: { createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => {
      const started = row.workspaces[0];

      if (!started) {
        return { roadmap: toRoadmap(row), workspace: null };
      }

      const lastActivityAt = latest(
        started.createdAt,
        started.session?.lastOpenedAt,
        started.attempts[0]?.createdAt,
        started.executions[0]?.createdAt,
      );

      return {
        roadmap: toRoadmap(row),
        workspace: {
          id: started.id,
          currentStep: started.currentStep,
          lastActivityAt,
        },
      };
    });
  }

  async start(userId: string, roadmapId: string) {
    const original = await this.db.roadmap.findFirst({
      where: { id: roadmapId, ...startableBy(userId) },
    });
    if (!original) {
      return null;
    }

    return this.provision(userId, original);
  }

  async enroll(userId: string, roadmapId: string) {
    const original = await this.db.roadmap.findUnique({
      where: { id: roadmapId },
    });
    if (!original) {
      return null;
    }

    return this.provision(userId, original);
  }

  // Creates the learner's workspace once, from the starter files, or resumes it.
  private provision(userId: string, original: StoredRoadmap) {
    const roadmapId = original.id;
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
        include: workspaceInclude,
      });

      return toWorkspace(resumed);
    });
  }

  // Insert once; later application versions must not overwrite a student's roadmap.
  private async ensurePapertRoadmaps() {
    await this.db.roadmap.createMany({
      data: PAPERT_ROADMAPS.map((item) => ({
        id: item.id,
        authorName: 'Papert',
        definition: item.definition,
      })),
      skipDuplicates: true,
    });
  }

  async owns(userId: string, id: string) {
    const row = await this.db.workspace.findFirst({
      where: { id, userId, roadmapId: { not: null } },
      select: { id: true },
    });

    return row !== null;
  }

  async workspace(userId: string, id: string, recentAttempts = false) {
    // A preparation workspace becomes studyable only once its roadmap is bound.
    const row = await this.db.workspace.findFirst({
      where: { id, userId, roadmapId: { not: null } },
      include: {
        ...workspaceInclude,
        attempts: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...(recentAttempts ? { take: 20 } : {}),
        },
      },
    });
    if (!row) {
      return null;
    }

    if (!recentAttempts || !row.roadmap) {
      return toWorkspace(row);
    }

    // Preserve the latest criteria feedback for steps outside the recent history window.
    // One index lookup per roadmap step avoids sorting the whole attempt history.
    const stepIds = toRoadmap(row.roadmap).definition.steps.map(
      (step) => step.id,
    );
    const latest = await this.db.$queryRaw<{ id: string }[]>`
      SELECT latest.id
      FROM unnest(${stepIds}::text[]) AS step(id)
      CROSS JOIN LATERAL (
        SELECT id FROM core.study_attempt
        WHERE workspace_id = ${id}::uuid AND step_id = step.id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) latest`;

    const missing = await this.db.studyAttempt.findMany({
      where: {
        workspaceId: id,
        id: {
          in: latest.map((attempt) => attempt.id),
          notIn: row.attempts.map((attempt) => attempt.id),
        },
      },
    });

    row.attempts.push(...missing);
    row.attempts.sort(newestFirst);

    const view = toWorkspace(row);
    const definition = view.roadmap.definition;
    const stepId =
      definition.steps[
        progressStepIndex(row.currentStep, definition.steps.length)
      ]?.id;
    // JSONB equality counts code versions without transferring old file snapshots to Node.
    const counts = await this.db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM (
        SELECT DISTINCT files FROM core.study_attempt
        WHERE workspace_id = ${id}::uuid AND step_id = ${stepId}
          AND result->>'status' = 'needs_work'
        LIMIT 3
      ) AS versions`;

    return {
      ...view,
      solution: solutionProgress(Number(counts[0]?.count ?? 0)),
    };
  }

  async saveRevision(userId: string, id: string, changes: WorkspaceChanges) {
    return this.db.$transaction(async (tx) => {
      const updated = await this.update(tx, userId, id, changes);
      if (!updated) {
        return null;
      }

      return tx.workspace.findUniqueOrThrow({
        where: { id },
        select: { id: true, revision: true },
      });
    });
  }

  // Optimistic write: only the revision the client saw may be replaced.
  private async update(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    changes: WorkspaceChanges,
  ) {
    const { count } = await tx.workspace.updateMany({
      where: { id, userId, revision: changes.revision },
      data: {
        notes: changes.notes,
        files: changes.files,
        revision: { increment: 1 },
      },
    });

    return count > 0;
  }

  async attempts(
    userId: string,
    id: string,
    page: { cursor?: string; limit: number; stepId?: string },
  ) {
    const owner = await this.db.workspace.findFirst({
      where: { id, userId, roadmapId: { not: null } },
      select: { roadmap: { select: { definition: true } } },
    });
    if (!owner?.roadmap) {
      return null;
    }

    const steps = roadmapSchema.parse(owner.roadmap.definition).steps;

    const rows = await this.db.studyAttempt.findMany({
      where: { workspaceId: id, stepId: page.stepId },
      select: attemptSummarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > page.limit;
    const visible = hasMore ? rows.slice(0, page.limit) : rows;

    return {
      items: visible.map((row) => toAttemptSummary(row, steps)),
      nextCursor: hasMore ? visible[visible.length - 1].id : null,
    };
  }

  async attempt(userId: string, id: string, attemptId: string) {
    const row = await this.db.studyAttempt.findFirst({
      where: { id: attemptId, workspace: { id, userId } },
    });

    return row ? toAttempt(row) : null;
  }

  async save(userId: string, id: string, changes: WorkspaceChanges) {
    return this.db.$transaction(async (tx) => {
      const updated = await this.update(tx, userId, id, changes);
      if (!updated) {
        return null;
      }

      const saved = await tx.workspace.findUniqueOrThrow({
        where: { id },
        include: workspaceInclude,
      });

      return toWorkspace(saved);
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

      return toAttempt(saved);
    });
  }
}
