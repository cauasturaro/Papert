"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEngagement, saveTimeZone } from "./engagement-api";
import { ENGAGEMENT_KEY } from "./engagement-keys";

/** The learner's official streak, achievements and progress, and their time-zone choice. */
export function useEngagement() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const engagement = useQuery({
    queryKey: ENGAGEMENT_KEY,
    queryFn: getEngagement,
    retry: false,
  });

  const saving = useMutation({
    mutationFn: ({ zone, detected }: { zone: string; detected: boolean }) =>
      saveTimeZone(zone, detected),
    onMutate: () => setError(null),
    onSuccess: (view) => queryClient.setQueryData(ENGAGEMENT_KEY, view),
    onError: (failure: Error) => setError(failure.message),
  });

  const { mutate } = saving;
  const reportDetectedTimeZone = useCallback(
    (zone: string) => mutate({ zone, detected: true }),
    [mutate],
  );

  return {
    engagement,
    error,
    savingTimeZone: saving.isPending,
    chooseTimeZone: (zone: string) =>
      saving.mutateAsync({ zone, detected: false }),
    reportDetectedTimeZone,
  };
}
