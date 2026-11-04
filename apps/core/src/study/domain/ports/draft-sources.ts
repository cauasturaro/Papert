/** What discarding a draft needs from the sources module: delete every source. */
export interface DraftSources {
  removeAll(userId: string, workspaceId: string): Promise<void>;
}
