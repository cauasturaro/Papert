"use client";

import { useQuery } from "@tanstack/react-query";
import { readWorkspace, type Workspace } from "../study-api";
import { studyKeys } from "../study-keys";
import type { SolutionProgress } from "../study-types";

export type WorkspaceWithProgress = Workspace & { solution?: SolutionProgress };

/**
 * The workspace the study session keeps in the query cache under `studyKeys.workspace(id)`. Saves and
 * refreshes write that entry, so this follows them without loading the workspace again.
 */
export function useCachedWorkspace(workspaceId: string) {
  const query = useQuery({
    queryKey: studyKeys.workspace(workspaceId),
    queryFn: () => readWorkspace(workspaceId),
    staleTime: Infinity,
  });

  return (query.data ?? null) as WorkspaceWithProgress | null;
}
