import type { TerminalStatus } from '../execution.js';
import type {
  DraftTransaction,
  GenerationLevel,
} from '../roadmaps/roadmap-drafts.js';

/** Implemented by Study; every call runs inside the caller's execution transaction. */
export interface ExecutionRecommendationDrafts {
  // Throws unless the draft is open or failed and not already being checked.
  admit(
    tx: DraftTransaction,
    userId: string,
    workspaceId: string,
  ): Promise<{ goal: string; level: GenerationLevel; sessionId: string }>;
  markSearching(
    tx: DraftTransaction,
    workspaceId: string,
    executionId: string,
  ): Promise<void>;
  // Settles the draft's check once; ignores other executions and other kinds.
  recordRecommendation(
    tx: DraftTransaction,
    execution: { id: string; workspaceId: string; input: unknown },
    status: TerminalStatus,
    result: unknown,
    publishedIds: string[],
  ): Promise<void>;
}
