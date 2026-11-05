import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  buildGenerationContext,
  buildRecommendationContext,
} from '../application/worker-context.js';
import { DEADLINE_MS } from '../domain/admission.js';
import { ExecutionError } from '../domain/execution.js';
import {
  allocateQuota,
  GENERATION_ATTEMPT_BUDGET,
  period,
  RECOMMENDATION_ATTEMPT_BUDGET,
} from '../domain/quota.js';
import {
  assertRateLimit,
  assertSameDraftRequest,
  rateWindowStart,
} from '../domain/admission.js';
import type { ExecutionRecommendationDrafts } from '../domain/ports/execution-recommendation-drafts.js';
import type { ExecutionRoadmapDrafts } from '../domain/ports/execution-roadmap-drafts.js';
import type { ExecutionWorkspaces } from '../domain/ports/execution-workspaces.js';
import type { GenerationRequest } from '../domain/roadmap-drafts.js';
import type {
  RecommendationCandidate,
  RecommendationRequest,
} from '../domain/recommendation.js';
import type { TutorSource } from '../domain/tutor-context.js';
import { lockUserQuota } from './execution-locks.js';

type Transaction = Prisma.TransactionClient;

/** What differs between draft executions; the outbox, quota and locks are shared. */
type DraftAdmission = {
  input: GenerationRequest | RecommendationRequest;
  budget: number;
  // Runs under the workspace lock: checks the draft and returns the worker context.
  context(tx: Transaction): Promise<unknown>;
  mark(tx: Transaction, executionId: string): Promise<void>;
};

/** Same outbox, quota and rate limit as tutoring; the draft supplies goal and level. */
export function admitGeneration(
  db: PrismaService,
  workspaces: ExecutionWorkspaces,
  drafts: ExecutionRoadmapDrafts,
  clock: () => Date,
  userId: string,
  workspaceId: string,
  input: GenerationRequest,
  sources: TutorSource[],
) {
  return admitForDraft(db, workspaces, clock, userId, workspaceId, {
    input,
    budget: GENERATION_ATTEMPT_BUDGET,
    context: async (tx) => {
      const draft = await drafts.admit(tx, userId, workspaceId);

      return buildGenerationContext(input, {
        ...draft,
        workspaceId,
        sources,
      });
    },
    mark: (tx, executionId) =>
      drafts.markGenerating(tx, workspaceId, executionId),
  });
}

/** The community check before a generation; Seymour sees public catalog text only. */
export function admitRecommendation(
  db: PrismaService,
  workspaces: ExecutionWorkspaces,
  drafts: ExecutionRecommendationDrafts,
  clock: () => Date,
  userId: string,
  workspaceId: string,
  input: RecommendationRequest,
  candidates: RecommendationCandidate[],
) {
  return admitForDraft(db, workspaces, clock, userId, workspaceId, {
    input,
    budget: RECOMMENDATION_ATTEMPT_BUDGET,
    context: async (tx) => {
      const draft = await drafts.admit(tx, userId, workspaceId);

      return buildRecommendationContext(input, { ...draft, candidates });
    },
    mark: (tx, executionId) =>
      drafts.markSearching(tx, workspaceId, executionId),
  });
}

// Lock order: quota row → workspace → draft, as for every admission of this user.
async function admitForDraft(
  db: PrismaService,
  workspaces: ExecutionWorkspaces,
  clock: () => Date,
  userId: string,
  workspaceId: string,
  admission: DraftAdmission,
) {
  const now = clock();
  const { input } = admission;

  return db.$transaction(async (tx) => {
    const quota = await lockUserQuota(tx, userId, period(now));

    const previous = await tx.execution.findUnique({
      where: { userId_requestKey: { userId, requestKey: input.requestKey } },
    });
    if (previous) {
      assertSameDraftRequest(previous, workspaceId, input);

      return previous;
    }

    if (!(await workspaces.lock(tx, userId, workspaceId))) {
      throw new ExecutionError('not_found', 'Workspace not found.');
    }

    const snapshot = await admission.context(tx);

    const recent = await tx.execution.count({
      where: { userId, createdAt: { gte: rateWindowStart(now) } },
    });
    assertRateLimit(recent);

    const reservation = allocateQuota(quota, admission.budget, now);

    await tx.executionQuota.update({
      where: { id: quota.id },
      data: { reserved: { increment: reservation } },
    });

    const created = await tx.execution.create({
      data: {
        userId,
        workspaceId,
        quotaId: quota.id,
        requestKey: input.requestKey,
        createdAt: now,
        deadline: new Date(now.getTime() + DEADLINE_MS),
        reserved: reservation,
        input: snapshot as Prisma.InputJsonValue,
      },
    });

    await admission.mark(tx, created.id);

    return created;
  });
}
