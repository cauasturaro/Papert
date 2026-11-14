import type { Prisma } from '@prisma/client';
import {
  parseRecommendationResult,
  parseStoredRecommendation,
} from '../application/contracts/recommendation.contract.js';
import { draftAdmissionFacts } from './draft-admission-facts.js';
import type { ProgressionTransaction } from '../domain/attempt-progression.js';
import {
  assertRecommendationAllowed,
  recommendationDecision,
} from '../domain/draft-recommendation.js';
import type { DraftRecommendation } from '../domain/draft-recommendation.js';
import type { RoadmapRecommendation } from '../domain/ports/roadmap-recommendation.js';
import type { GenerationStatus } from '../domain/roadmap-draft.js';

/** Executions call these inside their own transaction, after locking the execution and quota rows. */
export class PrismaRoadmapRecommendation implements RoadmapRecommendation {
  async admit(
    context: ProgressionTransaction,
    userId: string,
    workspaceId: string,
  ) {
    const tx = context as Prisma.TransactionClient;

    // The caller already locked this user's workspace row.
    const draft = await draftAdmissionFacts(tx, userId, workspaceId);
    assertRecommendationAllowed(draft.status, draft.recommendation);

    return draft.facts();
  }

  async markSearching(
    context: ProgressionTransaction,
    workspaceId: string,
    executionId: string,
  ) {
    const tx = context as Prisma.TransactionClient;

    // A new check replaces the previous result and any earlier decline.
    const searching: DraftRecommendation = {
      executionId,
      status: 'searching',
      matches: [],
      declined: false,
    };

    await tx.roadmapDraft.update({
      where: { workspaceId },
      data: { recommendation: searching, updatedAt: new Date() },
    });
  }

  async recordRecommendation(
    context: ProgressionTransaction,
    execution: { id: string; workspaceId: string; input: unknown },
    status: GenerationStatus,
    result: unknown,
    publishedIds: string[],
  ) {
    const tx = context as Prisma.TransactionClient;
    const input = execution.input as { kind?: string };
    if (input.kind !== 'recommendation') {
      return;
    }

    await tx.$queryRaw`
      SELECT id
      FROM core.workspace
      WHERE id = ${execution.workspaceId}::uuid
      FOR UPDATE`;

    const draft = await tx.roadmapDraft.findUnique({
      where: { workspaceId: execution.workspaceId },
    });
    const current = parseStoredRecommendation(draft?.recommendation);

    const matches =
      status === 'completed' ? parseRecommendationResult(result) : null;
    const decision = recommendationDecision(
      current,
      execution.id,
      status,
      matches,
      publishedIds,
    );

    if (decision.action === 'ignore') {
      return;
    }

    await tx.roadmapDraft.update({
      where: { workspaceId: execution.workspaceId },
      data: {
        recommendation: decision.recommendation,
        updatedAt: new Date(),
      },
    });
  }
}
