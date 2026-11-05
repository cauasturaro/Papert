import type { Execution, Prisma } from '@prisma/client';
import { parseEvaluation } from '../application/contracts/evaluation.contract.js';
import { analysisOutcome } from '../domain/analysis.js';
import type { TerminalStatus } from '../domain/execution.js';
import type { Grounding } from '../domain/grounding.js';
import type { DraftScope } from '../domain/ports/execution-lifecycle.js';
import type { ExecutionRecommendationDrafts } from '../domain/ports/execution-recommendation-drafts.js';
import type { ExecutionRoadmapDrafts } from '../domain/ports/execution-roadmap-drafts.js';
import type { ExecutionStudyProgression } from '../domain/ports/execution-study-progression.js';
import { lockQuota } from './execution-locks.js';

type Transaction = Prisma.TransactionClient;

export type FinishedResult = {
  text?: string;
  evaluation?: unknown;
  grounding?: Grounding | null;
  roadmap?: unknown;
  recommendation?: unknown;
  scope?: DraftScope;
};

/**
 * Moves a locked execution to a terminal status and records its result in Study. The quota
 * row is locked before Study locks the workspace, the same quota → workspace order admissions use.
 */
export class PrismaExecutionSettlement {
  constructor(
    private readonly now: () => Date,
    private readonly study: ExecutionStudyProgression,
    private readonly drafts: ExecutionRoadmapDrafts,
    private readonly recommendations: ExecutionRecommendationDrafts,
  ) {}

  async finish(
    tx: Transaction,
    job: Execution,
    status: TerminalStatus,
    result: FinishedResult = {},
  ) {
    const { text = job.text, evaluation, grounding = null } = result;

    await lockQuota(tx, job.quotaId);

    await this.study.recordOutcome(tx, job, (snapshot) => {
      const parsedEvaluation =
        status === 'completed' && evaluation !== undefined
          ? parseEvaluation(evaluation)
          : undefined;

      return analysisOutcome(
        snapshot,
        job.id,
        status,
        parsedEvaluation,
        this.now(),
      );
    });

    await this.drafts.recordGeneration(
      tx,
      job,
      status,
      result.roadmap,
      result.scope?.liveSourceIds ?? [],
    );

    await this.recommendations.recordRecommendation(
      tx,
      job,
      status,
      result.recommendation,
      result.scope?.publishedIds ?? [],
    );

    await tx.executionQuota.update({
      where: { id: job.quotaId },
      data: {
        reserved: { decrement: job.reserved },
      },
    });

    return tx.execution.update({
      where: { id: job.id },
      data: {
        status,
        text,
        grounding: grounding ?? undefined,
        reserved: 0,
        finishedAt: this.now(),
        sequence: { increment: 1 },
      },
    });
  }
}
