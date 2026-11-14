import type { ProgressionTransaction } from '../attempt-progression.js';
import type { Level } from '../study.js';
import type { GenerationStatus } from '../roadmap-draft.js';

/** Driven by executions inside its own transaction; see ExecutionRecommendationDrafts. */
export interface RoadmapRecommendation {
  admit(
    tx: ProgressionTransaction,
    userId: string,
    workspaceId: string,
  ): Promise<{ goal: string; level: Level; sessionId: string }>;
  markSearching(
    tx: ProgressionTransaction,
    workspaceId: string,
    executionId: string,
  ): Promise<void>;
  recordRecommendation(
    tx: ProgressionTransaction,
    execution: { id: string; workspaceId: string; input: unknown },
    status: GenerationStatus,
    result: unknown,
    publishedIds: string[],
  ): Promise<void>;
}
