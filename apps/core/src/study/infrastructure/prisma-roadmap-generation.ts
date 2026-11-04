import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { parseGeneratedRoadmap } from '../application/generation-contract.js';
import type { ProgressionTransaction } from '../domain/attempt-progression.js';
import type { RoadmapGeneration } from '../domain/draft-ports.js';
import {
  assertGenerationAllowed,
  authorizedEvidence,
  generationDecision,
  GENERATED_AUTHOR_NAME,
} from '../domain/roadmap-draft.js';
import type { DraftStatus, GenerationStatus } from '../domain/roadmap-draft.js';
import { levelSchema } from '../domain/study.js';

function consultedSources(input: unknown) {
  const snapshot = input as { sources?: { id: string; filename: string }[] };

  return (snapshot.sources ?? []).map((source) => ({
    id: source.id,
    filename: source.filename,
  }));
}

/** Executions call these inside their own transaction; lock order is execution → workspace. */
export class PrismaRoadmapGeneration implements RoadmapGeneration {
  constructor(private readonly newId: () => string = randomUUID) {}

  async admit(
    context: ProgressionTransaction,
    userId: string,
    workspaceId: string,
  ) {
    const tx = context as Prisma.TransactionClient;

    // The caller already locked this user's workspace row.
    const draft = await tx.roadmapDraft.findFirst({
      where: { workspaceId, userId },
      include: { workspace: { include: { session: true } } },
    });
    assertGenerationAllowed((draft?.status as DraftStatus | undefined) ?? null);

    const session = draft!.workspace.session;
    if (!session) {
      throw new Error('Draft study session is missing.');
    }

    return {
      goal: draft!.goal,
      level: levelSchema.parse(draft!.level),
      sessionId: session.id,
    };
  }

  async markGenerating(
    context: ProgressionTransaction,
    workspaceId: string,
    executionId: string,
  ) {
    const tx = context as Prisma.TransactionClient;

    await tx.roadmapDraft.update({
      where: { workspaceId },
      data: {
        status: 'generating',
        executionId,
        // A previous failure no longer describes the draft once a new attempt starts.
        outcome: Prisma.DbNull,
        updatedAt: new Date(),
      },
    });
  }

  async recordGeneration(
    context: ProgressionTransaction,
    execution: {
      id: string;
      userId: string;
      workspaceId: string;
      input: unknown;
    },
    status: GenerationStatus,
    candidate: unknown,
    liveSourceIds: string[],
  ) {
    const tx = context as Prisma.TransactionClient;
    const input = execution.input as { kind?: string };
    if (input.kind !== 'generation') {
      return;
    }

    await tx.$queryRaw`SELECT id FROM core.workspace WHERE id = ${execution.workspaceId}::uuid FOR UPDATE`;

    const draft = await tx.roadmapDraft.findUnique({
      where: { workspaceId: execution.workspaceId },
    });
    const state = draft
      ? { status: draft.status as DraftStatus, executionId: draft.executionId }
      : null;
    const parsed =
      status === 'completed' ? parseGeneratedRoadmap(candidate) : null;
    const decision = generationDecision(state, execution.id, status, parsed);

    if (decision.action === 'ignore') {
      return;
    }

    if (decision.action === 'release') {
      await tx.roadmapDraft.update({
        where: { workspaceId: execution.workspaceId },
        data: {
          status: decision.status,
          outcome: { reason: decision.reason, executionId: execution.id },
          updatedAt: new Date(),
        },
      });

      return;
    }

    const { definition } = decision.roadmap;
    const stepIds = definition.steps.map((step) => step.id);
    const evidence = authorizedEvidence(
      decision.roadmap.evidence,
      liveSourceIds,
      stepIds,
    );

    const roadmapId = this.newId();

    await tx.roadmap.create({
      data: {
        id: roadmapId,
        authorName: GENERATED_AUTHOR_NAME,
        authorUserId: execution.userId,
        definition,
      },
    });

    // Bound once (database trigger); the conditional update also guards a racing consolidation.
    const bound = await tx.workspace.updateMany({
      where: { id: execution.workspaceId, roadmapId: null },
      data: {
        roadmapId,
        files: definition.starterFiles,
        revision: { increment: 1 },
      },
    });
    if (bound.count !== 1) {
      throw new Error('Draft workspace is already bound to a roadmap.');
    }

    const outcome = {
      roadmapId,
      executionId: execution.id,
      evidence,
      consulted: consultedSources(execution.input),
    };

    await tx.roadmapDraft.update({
      where: { workspaceId: execution.workspaceId },
      data: {
        status: 'generated',
        outcome: outcome as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }
}
