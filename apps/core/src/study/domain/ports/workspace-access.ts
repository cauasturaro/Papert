import type { ProgressionTransaction } from '../attempt-progression.js';

/** Driven by executions, partly inside its own transaction; see ExecutionWorkspaces. */
export interface WorkspaceAccess {
  lock(
    tx: ProgressionTransaction,
    userId: string,
    workspaceId: string,
  ): Promise<{
    revision: number;
    files: Record<string, string>;
    currentStep: number;
    roadmap: { definition: unknown } | null;
    sessionId: string | null;
  } | null>;
  saved(
    userId: string,
    workspaceId: string,
  ): Promise<{ revision: number; files: Record<string, string> } | null>;
  owns(userId: string, workspaceId: string): Promise<boolean>;
}
