import type { TerminalStatus } from '../execution.js';
import type {
  DraftTransaction,
  GenerationLevel,
} from '../roadmaps/roadmap-drafts.js';

/** Implemented by Study; every call runs inside the caller's execution transaction. */
export interface ExecutionRoadmapDrafts {
  // Throws when the draft is missing, discarded, generating or already generated.
  admit(
    tx: DraftTransaction,
    userId: string,
    workspaceId: string,
  ): Promise<{ goal: string; level: GenerationLevel; sessionId: string }>;
  markGenerating(
    tx: DraftTransaction,
    workspaceId: string,
    executionId: string,
  ): Promise<void>;
  // Registers the roadmap once, or releases the draft; ignores other executions.
  recordGeneration(
    tx: DraftTransaction,
    execution: {
      id: string;
      userId: string;
      workspaceId: string;
      input: unknown;
    },
    status: TerminalStatus,
    candidate: unknown,
    liveSourceIds: string[],
  ): Promise<void>;
}
