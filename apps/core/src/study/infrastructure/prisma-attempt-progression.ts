import {
  attemptOutcomeDecision,
  completedRoadmap,
} from '../domain/attempt-progression.js';
import type { Prisma } from '@prisma/client';
import {
  roadmapSchema,
  stepSchema,
} from '../application/contracts/study.contract.js';
import type { AttemptProgression } from '../domain/ports/attempt-progression.js';
import type {
  ProgressionTransaction,
  ProgressionStep,
  OutcomeSnapshot,
  AttemptOutcome,
  RecordedOutcome,
} from '../domain/attempt-progression.js';

export class PrismaAttemptProgression implements AttemptProgression {
  definition(value: unknown) {
    return roadmapSchema.parse(value);
  }

  // The caller holds the workspace lock, serializing snapshots with saves and results.
  snapshot(
    context: ProgressionTransaction,
    workspaceId: string,
    revision: number,
    step: ProgressionStep,
    files: unknown,
  ) {
    const tx = context as Prisma.TransactionClient;

    return tx.studyAttempt.upsert({
      where: {
        workspaceId_revision_stepId: { workspaceId, revision, stepId: step.id },
      },
      create: {
        workspaceId,
        stepId: step.id,
        revision,
        files: files as Prisma.InputJsonValue,
        challenge: step.challenge,
      },
      update: {},
    });
  }

  recent(context: ProgressionTransaction, workspaceId: string, stepId: string) {
    const tx = context as Prisma.TransactionClient;

    return tx.studyAttempt.findMany({
      where: { workspaceId, stepId },
      select: { revision: true, result: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
  }

  updateResult(
    context: ProgressionTransaction,
    id: string,
    result: Record<string, unknown>,
  ) {
    const tx = context as Prisma.TransactionClient;

    return tx.studyAttempt.update({
      where: { id },
      data: { result: result as Prisma.InputJsonValue },
    });
  }

  async recordOutcome(
    context: ProgressionTransaction,
    execution: { id: string; workspaceId: string; input: unknown },
    assess: (snapshot: OutcomeSnapshot) => AttemptOutcome,
  ): Promise<RecordedOutcome | null> {
    const tx = context as Prisma.TransactionClient;
    const input = execution.input as { attemptId?: string };
    if (!input.attemptId) {
      return null;
    }

    // Lock order stays execution → workspace → attempt, inside the caller's transaction.
    await tx.$queryRaw`SELECT id FROM core.workspace WHERE id = ${execution.workspaceId}::uuid FOR UPDATE`;

    const attempt = await tx.studyAttempt.findUnique({
      where: { id: input.attemptId },
      include: { workspace: { include: { roadmap: true } } },
    });
    const state = attempt?.result as
      { status?: string; executionId?: string } | undefined;
    const lockedAttempt = attempt ? { ...attempt, state: state ?? null } : null;
    const association = {
      workspaceId: execution.workspaceId,
      executionId: execution.id,
    };
    const eligibility = attemptOutcomeDecision(lockedAttempt, association);
    if (!eligibility.applies || !attempt) {
      return null;
    }

    const challenge = stepSchema.shape.challenge.parse(attempt.challenge);
    const snapshot = {
      id: attempt.id,
      revision: attempt.revision,
      stepId: attempt.stepId,
      criteria: challenge.criteria.map((criterion) => criterion.id),
    };
    const outcome = assess(snapshot);

    await this.updateResult(tx, attempt.id, outcome.result);

    const recorded: RecordedOutcome = {
      status: outcome.status,
      completedRoadmap: null,
    };
    if (!outcome.approved) {
      return recorded;
    }

    // Attempts only exist in workspaces bound to a roadmap.
    const bound = attempt.workspace.roadmap;
    if (!bound) {
      return recorded;
    }

    const definition = roadmapSchema.parse(bound.definition);
    const transition = attemptOutcomeDecision(lockedAttempt, association, {
      approved: outcome.approved,
      currentStep: attempt.workspace.currentStep,
      steps: definition.steps,
    });
    if (!transition.advance || transition.nextStep === null) {
      return recorded;
    }

    // Conditional increment makes concurrent or redelivered approvals unlock once.
    const unlocked = await tx.workspace.updateMany({
      where: {
        id: execution.workspaceId,
        currentStep: transition.nextStep - 1,
      },
      data: { currentStep: { increment: 1 } },
    });
    if (unlocked.count !== 1 || !transition.completes) {
      return recorded;
    }

    const roadmap = { id: bound.id, ...definition };

    return {
      ...recorded,
      completedRoadmap: completedRoadmap(roadmap, execution.workspaceId),
    };
  }
}
