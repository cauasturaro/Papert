// Only infrastructure may unwrap this caller-owned transaction; no nested transaction is started.
export type WorkspaceTransaction = object;

/** The saved state an admission reads under the workspace lock. */
export type LockedWorkspace = {
  revision: number;
  files: Record<string, string>;
  currentStep: number;
  // Null in a preparation workspace, which has no roadmap yet.
  roadmap: { definition: unknown } | null;
  sessionId: string | null;
};

/** Implemented by Study; executions never reads workspace tables itself. */
export interface ExecutionWorkspaces {
  // Locks the user's workspace in the caller's transaction; null when it is missing or not theirs.
  lock(
    tx: WorkspaceTransaction,
    userId: string,
    workspaceId: string,
  ): Promise<LockedWorkspace | null>;
  // The saved revision and files, read without a lock; null when missing or not theirs.
  saved(
    userId: string,
    workspaceId: string,
  ): Promise<{ revision: number; files: Record<string, string> } | null>;
  owns(userId: string, workspaceId: string): Promise<boolean>;
}
