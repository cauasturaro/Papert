"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { isRunning } from "../execution/execution-state";
import { studyKeys } from "../study-keys";
import { useExecutionProgress } from "../execution/use-execution-progress";
import {
  cancelExecution,
  discardDraft,
  draftKey,
  getDraft,
  readExecution,
  startGeneration,
} from "./drafts-api";

const DRAFT_POLL_MS = 2000;
// Generation reports progress text often; keep reads close to the old one-second cadence.
const EXECUTION_MAX_POLL_MS = 2000;

/** One preparation workspace: its draft, the running generation and its actions. */
export function useDraft(workspaceId: string) {
  const queryClient = useQueryClient();
  const key = draftKey(workspaceId);
  // Kept until Core accepts the request, so a retried click cannot start a second run.
  const requestKey = useRef<string | null>(null);

  const draftQuery = useQuery({
    queryKey: key,
    queryFn: () => getDraft(workspaceId),
    // Core settles generations and community checks on the draft; poll while either runs.
    refetchInterval: (query) => {
      const data = query.state.data;
      const running =
        data?.status === "generating" ||
        data?.recommendation?.status === "searching";

      return running ? DRAFT_POLL_MS : false;
    },
  });

  const draft = draftQuery.data;
  const runningId = draft?.status === "generating" ? draft.executionId : null;

  const progress = useExecutionProgress({
    executionId: runningId,
    read: readExecution,
    maxPollMs: EXECUTION_MAX_POLL_MS,
  });

  const execution = progress.snapshot;
  const settled = !!execution && !isRunning(execution);

  // Core settles the draft in the same transaction that finishes the execution; the study
  // home lists drafts and roadmaps, so both change too.
  const refreshSettled = useEffectEvent(() => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: studyKeys.drafts() });
    void queryClient.invalidateQueries({ queryKey: studyKeys.roadmaps() });
  });

  useEffect(() => {
    if (settled) {
      refreshSettled();
    }
  }, [settled, execution?.id]);

  const generation = useMutation({
    mutationFn: () => {
      requestKey.current ??= crypto.randomUUID();

      return startGeneration(workspaceId, requestKey.current);
    },
    onSuccess: () => {
      requestKey.current = null;

      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: studyKeys.drafts() });
    },
  });

  const cancellation = useMutation({
    mutationFn: () => cancelExecution(runningId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const discard = useMutation({
    mutationFn: () => discardDraft(workspaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studyKeys.drafts() });
    },
  });

  function learnerError(error: Error | null) {
    return error ? toLearnerMessage(error) : null;
  }

  return {
    draft,
    loading: draftQuery.isPending,
    loadError: draftQuery.error,
    refetch: draftQuery.refetch,
    // Seymour's progress text while running, its final message afterwards.
    progress: execution?.text ?? "",
    // When the running generation started, if Core reported it.
    startedAt: execution?.createdAt ?? null,
    generate: generation.mutateAsync,
    generating: generation.isPending || draft?.status === "generating",
    generateError: learnerError(generation.error),
    cancel: () => cancellation.mutate(),
    cancelling: cancellation.isPending,
    cancelError: learnerError(cancellation.error),
    discard: discard.mutateAsync,
    discarding: discard.isPending,
    discardError: learnerError(discard.error),
  };
}
