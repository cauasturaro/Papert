"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "../study-api";
import { studyKeys } from "../study-keys";
import { attemptDetail } from "./attempts-api";

export function useAttemptFiles(workspace: Workspace, attemptId: string | undefined) {
  const queryClient = useQueryClient();
  const options = {
    queryKey: [...studyKeys.workspace(workspace.id), "attempt-files", attemptId],
    queryFn: async () => {
      if (!attemptId) {
        throw new Error("No attempt selected.");
      }

      const attempt = await attemptDetail(workspace.id, attemptId);

      return attempt.files;
    },
    initialData: workspace.attempts.find((attempt) => attempt.id === attemptId)?.files,
    staleTime: Infinity,
  };
  const query = useQuery({ ...options, enabled: false });

  function load() {
    return queryClient.fetchQuery(options);
  }

  return { files: query.data, load };
}
