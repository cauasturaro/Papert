import type { Prisma } from '@prisma/client';
import { parseStoredRecommendation } from '../application/contracts/recommendation.contract.js';
import { levelSchema } from '../application/contracts/study.contract.js';
import type { DraftStatus } from '../domain/roadmap-draft.js';

/**
 * Reads a draft under the caller's workspace lock. Callers check `status` and
 * `recommendation` with their own rule before taking the facts a worker needs.
 */
export async function draftAdmissionFacts(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
) {
  const draft = await tx.roadmapDraft.findFirst({
    where: { workspaceId, userId },
    include: { workspace: { include: { session: true } } },
  });

  const status = (draft?.status as DraftStatus | undefined) ?? null;
  const recommendation = parseStoredRecommendation(draft?.recommendation);

  function facts() {
    const session = draft?.workspace.session;
    if (!draft || !session) {
      throw new Error('Draft study session is missing.');
    }

    return {
      goal: draft.goal,
      level: levelSchema.parse(draft.level),
      sessionId: session.id,
    };
  }

  return { status, recommendation, facts };
}
