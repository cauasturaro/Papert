import type { ProgressionTransaction } from '../attempt-progression.js';
import type { Level } from '../study.js';
import type { GenerationStatus } from '../roadmap-draft.js';

/** Driven by executions inside its own transaction; see ExecutionRoadmapDrafts. */
export interface RoadmapGeneration {
  admit(
    tx: ProgressionTransaction,
    userId: string,
    workspaceId: string,
  ): Promise<{ goal: string; level: Level; sessionId: string }>;
  markGenerating(
    tx: ProgressionTransaction,
    workspaceId: string,
    executionId: string,
  ): Promise<void>;
  recordGeneration(
    tx: ProgressionTransaction,
    execution: {
      id: string;
      userId: string;
      workspaceId: string;
      input: unknown;
    },
    status: GenerationStatus,
    candidate: unknown,
    liveSourceIds: string[],
  ): Promise<void>;
}
