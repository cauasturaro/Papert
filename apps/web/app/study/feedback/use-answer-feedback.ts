"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearRating,
  listFeedback,
  rateAnswer,
  type AnswerFeedback,
  type FeedbackInput,
} from "./feedback-api";
import { changes, feedbackIds } from "./feedback-state";

export const FEEDBACK_KEY = "feedback";

type Rate = { executionId: string; input: FeedbackInput };

/** Verdicts for the answers on screen; one rating request per answer at a time. */
export function useAnswerFeedback(executionIds: string[]) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<{ id: string; message: string } | null>(
    null,
  );
  const ids = feedbackIds(executionIds);
  const queryKey = [FEEDBACK_KEY, ids];

  const list = useQuery({
    queryKey,
    queryFn: () => listFeedback(ids),
    enabled: ids.length > 0,
  });

  const rating = useMutation({
    mutationFn: ({ executionId, input }: Rate) =>
      rateAnswer(executionId, input),
    onMutate: () => setError(null),
    onError: (failure: Error, { executionId }) =>
      setError({ id: executionId, message: failure.message }),
    onSuccess: (saved) => {
      queryClient.setQueryData<AnswerFeedback[]>(queryKey, (current = []) => [
        ...current.filter((item) => item.executionId !== saved.executionId),
        saved,
      ]);
    },
  });

  const clearing = useMutation({
    mutationFn: (executionId: string) => clearRating(executionId),
    onMutate: () => setError(null),
    onError: (failure: Error, executionId) =>
      setError({ id: executionId, message: failure.message }),
    onSuccess: (_result, executionId) => {
      queryClient.setQueryData<AnswerFeedback[]>(queryKey, (current = []) =>
        current.filter((item) => item.executionId !== executionId),
      );
    },
  });

  const busy = rating.isPending || clearing.isPending;

  function feedbackFor(executionId: string) {
    return list.data?.find((item) => item.executionId === executionId);
  }

  function rate(executionId: string, input: FeedbackInput) {
    // One request at a time keeps the shown rating from flickering between answers.
    if (busy) {
      return;
    }

    if (!changes(feedbackFor(executionId), input)) {
      return;
    }

    rating.mutate({ executionId, input });
  }

  function clear(executionId: string) {
    if (busy || !feedbackFor(executionId)) {
      return;
    }

    clearing.mutate(executionId);
  }

  const pendingId = rating.isPending ? rating.variables?.executionId : null;
  const pendingInput = rating.isPending ? rating.variables?.input : null;
  const clearingId = clearing.isPending ? clearing.variables : null;

  return {
    feedbackFor,
    rate,
    clear,
    pendingId,
    // True while this answer's verdict is being removed.
    clearingFor: (executionId: string) => clearingId === executionId,
    // The verdict being sent, shown at once instead of waiting for the server.
    pendingFor: (executionId: string) =>
      pendingId === executionId ? (pendingInput ?? null) : null,
    errorFor: (executionId: string) =>
      error?.id === executionId ? error.message : null,
  };
}

export type AnswerFeedbackActions = ReturnType<typeof useAnswerFeedback>;
