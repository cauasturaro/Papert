"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { Workspace } from "../study-api";
import { studyKeys } from "../study-keys";
import { attemptPage, type AttemptPage } from "./attempts-api";
import {
  nextAttemptCursor,
  summariesOf,
  uniqueAttempts,
  unsupportedAttemptHistory,
} from "./attempt-history-state";

export function useAttemptHistory(workspace: Workspace) {
  const latest = workspace.attempts[0];
  const refreshKey = `${latest?.id ?? "none"}:${latest?.result.status ?? "none"}`;
  const query = useInfiniteQuery({
    queryKey: [...studyKeys.workspace(workspace.id), "attempts", refreshKey],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<AttemptPage> => {
      try {
        return await attemptPage(workspace.id, { cursor: pageParam });
      } catch (error) {
        if (pageParam === null && unsupportedAttemptHistory(error)) {
          return { items: summariesOf(workspace), nextCursor: null };
        }

        throw error;
      }
    },
    getNextPageParam: nextAttemptCursor,
    retry: false,
  });
  const attempts = query.data
    ? uniqueAttempts(query.data.pages.flatMap((page) => page.items))
    : summariesOf(workspace);

  function loadOlder() {
    if (!query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }

  function retry() {
    if (query.isFetchNextPageError) {
      loadOlder();

      return;
    }

    void query.refetch();
  }

  return {
    attempts,
    error: query.error,
    hasNextPage: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadOlder,
    retry,
  };
}
