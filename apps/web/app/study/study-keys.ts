/** Query keys of the study area, so readers, writers and invalidations cannot drift apart. */
export const studyKeys = {
  workspace: (workspaceId: string) => ["study", workspaceId] as const,
  roadmaps: () => ["roadmaps"] as const,
  drafts: () => ["drafts"] as const,
  draft: (workspaceId: string) => ["draft", workspaceId] as const,
  sources: (workspaceId: string) => ["sources", workspaceId] as const,
  sourceContent: (sourceId: string, versionId: string) =>
    ["source-content", sourceId, versionId] as const,
  sourceView: (workspaceId: string, sourceId: string) =>
    ["source-view", workspaceId, sourceId] as const,
  execution: (executionId: string) =>
    ["executions", "detail", executionId] as const,
  quota: () => ["executions", "quota"] as const,
};
