"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
    retry: false,
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

  function feedbackFor(executionId: string) {
    return list.data?.find((item) => item.executionId === executionId);
  }

  function rate(executionId: string, input: FeedbackInput) {
    if (!changes(feedbackFor(executionId), input)) {
      return;
    }

    rating.mutate({ executionId, input });
  }

  const pendingId = rating.isPending ? rating.variables?.executionId : null;

  return {
    feedbackFor,
    rate,
    pendingId,
    errorFor: (executionId: string) =>
      error?.id === executionId ? error.message : null,
  };
}

export type AnswerFeedbackActions = ReturnType<typeof useAnswerFeedback>;
