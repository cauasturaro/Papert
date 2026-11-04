import type { ProgressionTransaction } from './attempt-progression.js';
import type { Level } from './study.js';
import type { GenerationStatus, RoadmapDraft } from './roadmap-draft.js';

// Each method locks the workspace row and applies the draft rules inside its transaction.
export interface RoadmapDraftRepository {
  create(
    userId: string,
    request: { goal: string; level: Level },
  ): Promise<RoadmapDraft>;
  list(userId: string): Promise<RoadmapDraft[]>;
  find(userId: string, workspaceId: string): Promise<RoadmapDraft | null>;
  discard(userId: string, workspaceId: string): Promise<RoadmapDraft>;
}

/** What discarding a draft needs from the sources module: delete every source. */
export interface DraftSources {
  removeAll(userId: string, workspaceId: string): Promise<void>;
}

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
