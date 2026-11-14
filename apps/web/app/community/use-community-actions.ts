"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { patchCards, type CardPatch } from "./catalog-state";
import {
  setFavorite,
  startCommunityRoadmap,
  vote,
  workspaceHref,
  type Vote,
} from "./community-api";
import { COMMUNITY_KEY } from "./community-keys";

const VOTE_KEY = [COMMUNITY_KEY, "vote"];
const SAVE_KEY = [COMMUNITY_KEY, "save"];

type CardMutation = { id: string };

// Pending ids across every mounted card, so a second click waits for the first result.
function usePendingIds(mutationKey: string[]) {
  return useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (mutation) => (mutation.state.variables as CardMutation).id,
  });
}

/** Vote, save and start actions shared by catalog cards, details and recommendations. */
export function useCommunityActions() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  function applyResult(id: string, patch: CardPatch) {
    queryClient.setQueriesData({ queryKey: [COMMUNITY_KEY] }, (data: unknown) =>
      patchCards(data, id, patch),
    );

    void queryClient.invalidateQueries({ queryKey: [COMMUNITY_KEY] });
  }

  function fail(failure: Error) {
    setError(toLearnerMessage(failure));
  }

  const voting = useMutation({
    mutationKey: VOTE_KEY,
    mutationFn: ({ id, value }: CardMutation & { value: Vote }) =>
      vote(id, value),
    onSuccess: (tally, { id }) => applyResult(id, tally),
    onError: fail,
  });

  const saving = useMutation({
    mutationKey: SAVE_KEY,
    mutationFn: ({ id, favorited }: CardMutation & { favorited: boolean }) =>
      setFavorite(id, favorited),
    onSuccess: (result, { id }) => applyResult(id, result),
    onError: fail,
  });

  // Core already created the workspace; the study page only opens it.
  const starting = useMutation({
    mutationFn: (id: string) => startCommunityRoadmap(id),
  });

  function openWorkspace(workspaceId: string) {
    router.push(workspaceHref(workspaceId));
  }

  async function startAsync(id: string) {
    const destination = await starting.mutateAsync(id);

    openWorkspace(destination.workspaceId);

    return destination;
  }

  const votingIds = usePendingIds(VOTE_KEY);
  const savingIds = usePendingIds(SAVE_KEY);

  return {
    vote: (id: string, value: Vote) => {
      setError(null);
      voting.mutate({ id, value });
    },
    isVoting: (id: string) => votingIds.includes(id),
    save: (id: string, favorited: boolean) => {
      setError(null);
      saving.mutate({ id, favorited });
    },
    isSaving: (id: string) => savingIds.includes(id),
    start: (id: string) => {
      setError(null);
      starting.mutate(id, {
        onSuccess: ({ workspaceId }) => openWorkspace(workspaceId),
      });
    },
    // Resolves once the workspace exists; the page then navigates to it.
    startAsync,
    createWorkspace: (id: string) => starting.mutateAsync(id),
    openWorkspace,
    isStarting: (id: string) => starting.isPending && starting.variables === id,
    startError: starting.error ? toLearnerMessage(starting.error) : null,
    resetStart: starting.reset,
    error,
  };
}

export type CommunityActions = ReturnType<typeof useCommunityActions>;
