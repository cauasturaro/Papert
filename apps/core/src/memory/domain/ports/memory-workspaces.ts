/** Implemented by Study; memory never reads workspace tables itself. */
export interface MemoryWorkspaces {
  owns(userId: string, workspaceId: string): Promise<boolean>;
}
