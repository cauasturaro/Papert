"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { executionRequest, type Quota } from "./execution-api";
import { studyKeys } from "../study-keys";

/** The learner's Seymour allowance, shared by the tutor and analysis panels. */
export function useQuota() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: studyKeys.quota(),
    queryFn: () => executionRequest<Quota>("quota"),
  });

  // Callers refresh after a request is accepted or settles, when the reservation changes.
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: studyKeys.quota() }),
    [queryClient],
  );

  return { quota: query.data ?? null, refresh };
}
