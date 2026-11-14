import { executionRecord } from './execution-snapshot.js';
import type { Execution, Prisma } from '@prisma/client';
import { parseEvaluation } from '../application/contracts/evaluation.contract.js';
import {
  analysisOutcome,
  evaluatedAnalysis,
} from '../domain/analysis/analysis.js';
import { completedTurn } from '../domain/tutor/conversation-window.js';
import type { TerminalStatus } from '../domain/execution.js';
import type { Grounding } from '../domain/tutor/grounding.js';
import type { DraftScope } from '../domain/ports/execution-lifecycle.js';
import type { ExecutionRecommendationDrafts } from '../domain/ports/execution-recommendation-drafts.js';
import type { ExecutionRoadmapDrafts } from '../domain/ports/execution-roadmap-drafts.js';
import type { ExecutionStudyProgression } from '../domain/ports/execution-study-progression.js';
import type { ExecutionMemory } from '../domain/ports/execution-memory.js';
import type { ExecutionEngagement } from '../domain/ports/execution-engagement.js';
import { lockQuota } from './execution-locks.js';

type Transaction = Prisma.TransactionClient;

export type FinishedResult = {
  text?: string;
  evaluation?: unknown;
  grounding?: Grounding | null;
  roadmap?: unknown;
  recommendation?: unknown;
  memory?: unknown;
  scope?: DraftScope;
};

/**
 * Moves a locked execution to a terminal status and records its result in Study, Engagement and
 * Memory. The quota row is locked before Study locks the workspace, the same quota → workspace
 * order admissions use; Engagement locks the learner's profile after the attempt.
 */
export class PrismaExecutionSettlement {
  constructor(
    private readonly now: () => Date,
    private readonly study: ExecutionStudyProgression,
    private readonly drafts: ExecutionRoadmapDrafts,
    private readonly recommendations: ExecutionRecommendationDrafts,
    private readonly memory: ExecutionMemory,
    private readonly engagement: ExecutionEngagement,
  ) {}

  async finish(
    tx: Transaction,
    job: Execution,
    status: TerminalStatus,
    result: FinishedResult = {},
  ) {
    const { text = job.text, evaluation, grounding = null } = result;

    await lockQuota(tx, job.quotaId);

    const recorded = await this.study.recordOutcome(tx, job, (snapshot) => {
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

    const analysis = evaluatedAnalysis(job, recorded, this.now());
    if (analysis) {
      await this.engagement.recordAnalysis(tx, analysis);
    }

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

    // Locks the conversation after the quota row, the order admissions use.
    const turn = completedTurn(executionRecord(job), status);
    if (turn) {
      await this.memory.recordTurn(tx, turn, result.memory, this.now());
    }

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
