import type { CompletedRoadmap } from './execution-study-progression.js';

// Only infrastructure may unwrap this caller-owned transaction; no nested transaction is started.
export type EngagementTransaction = object;

/** An analysis Core evaluated, reported to the learner's streak and achievements. */
export type EvaluatedAnalysis = {
  userId: string;
  executionId: string;
  workspaceId: string;
  approved: boolean;
  evaluatedAt: Date;
  completedRoadmap: CompletedRoadmap | null;
};

/**
 * Engagement's participant in the settlement transaction; implemented by Engagement, so
 * executions never reads streak or achievement tables itself.
 */
export interface ExecutionEngagement {
  recordAnalysis(
    tx: EngagementTransaction,
    analysis: EvaluatedAnalysis,
  ): Promise<void>;
}
