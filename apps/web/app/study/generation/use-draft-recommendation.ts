"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSelected } from "../../community/community-api";
import { selectionKey } from "../../community/community-keys";
import {
  declineRecommendation,
  draftKey,
  startRecommendation,
  type RoadmapDraft,
} from "./drafts-api";
import { recommendationView, shouldCheck } from "./recommendation-state";

/** The draft's community check: starts it once, lists the matches, records a decline. */
export function useDraftRecommendation(draft: RoadmapDraft) {
  const queryClient = useQueryClient();
  const workspaceId = draft.workspaceId;
  const key = draftKey(workspaceId);
  // Kept until Core accepts the request, so a retried check cannot start twice.
  const requestKey = useRef<string | null>(null);

  const recommendation = draft.recommendation;
  const view = recommendationView(recommendation);
  const ids = recommendation?.matches.map((match) => match.roadmapId) ?? [];

  const check = useMutation({
    mutationFn: () => {
      requestKey.current ??= crypto.randomUUID();

      return startRecommendation(workspaceId, requestKey.current);
    },
    onSuccess: () => {
      requestKey.current = null;

      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const decline = useMutation({
    mutationFn: () => declineRecommendation(workspaceId),
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
    },
  });

  const matches = useQuery({
    queryKey: selectionKey(ids),
    queryFn: () => listSelected(ids),
    enabled: view === "matches" || (view === "declined" && ids.length > 0),
    retry: false,
  });

  // Every draft that can still generate is checked once, before Generate is offered.
  const needsCheck = shouldCheck(draft.status, recommendation);

  useEffect(() => {
    if (needsCheck && check.isIdle) {
      check.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsCheck]);

  return {
    view,
    cards: matches.data ?? [],
    cardsLoading: matches.isPending && matches.fetchStatus !== "idle",
    cardsError: matches.error?.message ?? null,
    check: () => check.mutate(),
    checking: check.isPending,
    checkError: check.error?.message ?? null,
    decline: () => decline.mutate(),
    declining: decline.isPending,
    declineError: decline.error?.message ?? null,
  };
}
