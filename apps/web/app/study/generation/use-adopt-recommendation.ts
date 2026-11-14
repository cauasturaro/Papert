"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toLearnerMessage } from "@/lib/api/learner-error";
import type { CommunityActions } from "../../community/use-community-actions";
import { studyKeys } from "../study-keys";
import { adoptRecommendation } from "./adopt-recommendation";
import { discardDraft } from "./drafts-api";
import type { Recommendation } from "./recommendation-panel";

export function useAdoptRecommendation(
  recommendation: Recommendation,
  actions: CommunityActions,
) {
  const queryClient = useQueryClient();

  const adoption = useMutation({
    mutationFn: async (roadmapId: string) => {
      await adoptRecommendation(
        () => actions.createWorkspace(roadmapId),
        () => discardDraft(recommendation.workspaceId),
        ({ workspaceId }) => actions.openWorkspace(workspaceId),
      );

      void queryClient.invalidateQueries({ queryKey: studyKeys.drafts() });
    },
  });

  return {
    adopt: (roadmapId: string) => adoption.mutate(roadmapId),
    pending: adoption.isPending,
    error: adoption.error ? toLearnerMessage(adoption.error) : null,
    reset: adoption.reset,
  };
}
