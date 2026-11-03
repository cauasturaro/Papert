"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSources } from "./sources-api";

/** Sources Seymour can search; shares the Sources panel's cache and polling. */
export function useReadySources(workspaceId: string) {
  const query = useQuery({
    queryKey: ["sources", workspaceId],
    queryFn: () => listSources(workspaceId),
  });

  return useMemo(
    () => (query.data ?? []).filter((source) => source.status === "ready"),
    [query.data],
  );
}
