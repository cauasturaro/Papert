import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { buildGenerationContext } from '../application/worker-context.js';
import {
  DEADLINE_MS,
  ExecutionError,
  GENERATION_ATTEMPT_BUDGET,
  period,
} from '../domain/execution.js';
import {
  allocateQuota,
  assertRateLimit,
  assertSameGeneration,
  rateWindowStart,
} from '../domain/policy.js';
import type {
  ExecutionRoadmapDrafts,
  GenerationRequest,
} from '../domain/roadmap-drafts.js';
import type { TutorSource } from '../domain/tutor-context.js';
import { lockUserQuota, lockWorkspace } from './execution-locks.js';

/** Same outbox, quota and rate limit as tutoring; the draft supplies goal and level. */
export async function admitGeneration(
  db: PrismaService,
  drafts: ExecutionRoadmapDrafts,
  clock: () => Date,
  userId: string,
  workspaceId: string,
  input: GenerationRequest,
  sources: TutorSource[],
) {
  const now = clock();

  return db.$transaction(async (tx) => {
    const quota = await lockUserQuota(tx, userId, period(now));

    const previous = await tx.execution.findUnique({
      where: { userId_requestKey: { userId, requestKey: input.requestKey } },
    });
    if (previous) {
      assertSameGeneration(previous, workspaceId, input);

      return previous;
    }

    if (!(await lockWorkspace(tx, workspaceId, userId))) {
      throw new ExecutionError('not_found', 'Workspace not found.');
    }

    const draft = await drafts.admit(tx, userId, workspaceId);

    const recent = await tx.execution.count({
      where: { userId, createdAt: { gte: rateWindowStart(now) } },
    });
    assertRateLimit(recent);

    const reservation = allocateQuota(quota, GENERATION_ATTEMPT_BUDGET, now);

    await tx.executionQuota.update({
      where: { id: quota.id },
      data: { reserved: { increment: reservation } },
    });

    const snapshot = buildGenerationContext(input, {
      ...draft,
      workspaceId,
      sources,
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

    await drafts.markGenerating(tx, workspaceId, created.id);

    return created;
  });
}
