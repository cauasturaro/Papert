import type { ExecutionRecord, WorkerEvent } from '../execution.js';
import type { Grounding } from '../tutor/grounding.js';

/** Facts checked outside the execution lock that a draft result is filtered against. */
export type DraftScope = {
  // Admitted sources still ready now, for generation evidence.
  liveSourceIds: string[];
  // Offered roadmaps still published now, for recommendation matches.
  publishedIds: string[];
};

/** Leases, results and terminal transitions of admitted executions. */
export interface ExecutionLifecycle {
  cancel(userId: string, id: string): Promise<ExecutionRecord>;
  claim(
    id: string,
    claimId?: string,
  ): Promise<{
    status: string;
    lease?: string;
    input?: unknown;
    budget?: number;
  }>;
  failed(id: string, lease: string): Promise<{ status: string }>;
  active(id: string, lease: string): Promise<boolean>;
  accept(
    event: WorkerEvent,
    grounding: Grounding | null,
    scope: DraftScope,
  ): Promise<ExecutionRecord>;
  // Who owns an execution, its admitted sources and offered roadmaps.
  sourceScope(id: string): Promise<{
    userId: string;
    workspaceId: string;
    sourceIds: string[];
    offeredRoadmapIds: string[];
  } | null>;
  // Times out overdue executions and returns how many there were.
  expire(): Promise<number>;
}
