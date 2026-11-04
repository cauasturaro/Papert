import { buildWorkerContext } from '../application/worker-context.js';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { SyntaxReport } from '../../analysis/domain/syntax.js';
import { ExecutionError, DEADLINE_MS, period } from '../domain/execution.js';
import type { ExecutionRequest } from '../domain/execution.js';
import type { ExecutionStudyProgression } from '../domain/attempt-progression.js';
import { assertMentionsReady } from '../domain/tutor-context.js';
import type { TutorSource } from '../domain/tutor-context.js';
import {
  admissionBudget,
  rateWindowStart,
  activeStudyStep,
  assertSameRequest,
  assertSavedRevision,
  assertSavedSelection,
  solutionEligible,
  assertSolutionEligible,
  assertAnalysisRetry,
  assertRateLimit,
  allocateQuota,
} from '../domain/policy.js';
import type { AttemptState } from '../domain/policy.js';
import { lockUserQuota, lockWorkspace } from './execution-locks.js';

export async function admitExecution(
  db: PrismaService,
  study: ExecutionStudyProgression,
  clock: () => Date,
  userId: string,
  workspaceId: string,
  input: ExecutionRequest,
  context: { syntax?: SyntaxReport; sources: TutorSource[] },
) {
  const { syntax, sources } = context;
  const now = clock();
  const budget = admissionBudget(input);

  const execution = await db.$transaction(async (tx) => {
    const quota = await lockUserQuota(tx, userId, period(now));

    const previous = await tx.execution.findUnique({
      where: { userId_requestKey: { userId, requestKey: input.requestKey } },
    });
    if (previous) {
      assertSameRequest(previous, workspaceId, input);

      return previous;
    }

    if (!(await lockWorkspace(tx, workspaceId, userId))) {
      throw new ExecutionError('not_found', 'Workspace not found.');
    }
    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: {
        roadmap: true,
        session: true,
      },
    });
    assertSavedRevision(workspace.revision, input.revision);

    // A draft workspace has no step to tutor or analyze.
    const roadmap = activeStudyStep(workspace.roadmap ?? undefined);
    const definition = study.definition(roadmap.definition);
    const step = activeStudyStep(
      definition.steps[workspace.currentStep],
      !!workspace.session,
    );

    const files = workspace.files as Record<string, string>;
    assertSavedSelection(input, files);

    const recentResults = input.mode
      ? await study.recent(tx, workspaceId, step.id)
      : [];
    const solutionAllowed = solutionEligible(recentResults.length);

    // Short-term conversation memory: the last completed exchanges of this chat.
    const completed = input.mode
      ? await tx.execution.findMany({
          where: { workspaceId, userId, status: 'completed' },
          select: { input: true, text: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

    assertMentionsReady(input.sourceIds, sources);

    assertSolutionEligible(input.mode, solutionAllowed);

    let attemptId: string | undefined;
    if (input.kind === 'analysis') {
      // The service linted this revision's files; the workspace lock keeps them unchanged.
      if (!syntax) {
        throw new ExecutionError(
          'conflict',
          'Save and reload the workspace before starting an execution.',
        );
      }

      const attempt = await study.snapshot(
        tx,
        workspaceId,
        input.revision,
        step,
        workspace.files,
      );
      const state = attempt.result as AttemptState;
      assertAnalysisRetry(state);

      if (state.status === 'evaluating' && state.executionId) {
        const running = await tx.execution.findUnique({
          where: { id: state.executionId },
        });
        assertAnalysisRetry(state, running?.status);
      }

      attemptId = attempt.id;
    }

    const recent = await tx.execution.count({
      where: { userId, createdAt: { gte: rateWindowStart(now) } },
    });
    assertRateLimit(recent);

    const reservation = allocateQuota(quota, budget, now);

    await tx.executionQuota.update({
      where: { id: quota.id },
      data: { reserved: { increment: reservation } },
    });

    const snapshot = buildWorkerContext(input, {
      sessionId: workspace.session!.id,
      workspaceId,
      files,
      step,
      objective: definition.description,
      solutionAllowed,
      recentResults,
      completed,
      sources,
      attemptId,
      syntax,
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

    if (attemptId) {
      await study.updateResult(tx, attemptId, {
        status: 'evaluating',
        executionId: created.id,
      });
    }

    return created;
  });

  return execution;
}
