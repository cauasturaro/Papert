"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isRunning } from "../execution-state";
import {
  cancelExecution,
  discardDraft,
  getDraft,
  readExecution,
  startGeneration,
} from "./drafts-api";

const DRAFT_POLL_MS = 2000;
const EXECUTION_POLL_MS = 1000;

/** One preparation workspace: its draft, the running generation and its actions. */
export function useDraft(workspaceId: string) {
  const queryClient = useQueryClient();
  const draftKey = ["draft", workspaceId];
  // Kept until Core accepts the request, so a retried click cannot start a second run.
  const requestKey = useRef<string | null>(null);

  const draftQuery = useQuery({
    queryKey: draftKey,
    queryFn: () => getDraft(workspaceId),
    refetchInterval: (query) =>
      query.state.data?.status === "generating" ? DRAFT_POLL_MS : false,
  });

  const draft = draftQuery.data;
  const runningId = draft?.status === "generating" ? draft.executionId : null;

  const executionQuery = useQuery({
    queryKey: ["execution", runningId],
    queryFn: () => readExecution(runningId!),
    enabled: !!runningId,
    refetchInterval: (query) =>
      isRunning(query.state.data ?? null) ? EXECUTION_POLL_MS : false,
  });

  const execution = executionQuery.data ?? null;
  const settled = !!execution && !isRunning(execution);

  // Core settles the draft in the same transaction that finishes the execution.
  useEffect(() => {
    if (settled) {
      void queryClient.invalidateQueries({ queryKey: draftKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, execution?.id]);

  const generation = useMutation({
    mutationFn: () => {
      requestKey.current ??= crypto.randomUUID();

      return startGeneration(workspaceId, requestKey.current);
    },
    onSuccess: () => {
      requestKey.current = null;

      void queryClient.invalidateQueries({ queryKey: draftKey });
    },
  });

  const cancellation = useMutation({
    mutationFn: () => cancelExecution(runningId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: draftKey });
    },
  });

  const discard = useMutation({
    mutationFn: () => discardDraft(workspaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["drafts"] });
    },
  });

  return {
    draft,
    loading: draftQuery.isPending,
    loadError: draftQuery.error?.message ?? null,
    // Seymour's progress text while running, its final message afterwards.
    progress: execution?.text ?? "",
    generate: generation.mutateAsync,
    generating: generation.isPending || draft?.status === "generating",
    generateError: generation.error?.message ?? null,
    cancel: cancellation.mutate,
    cancelling: cancellation.isPending,
    discard: discard.mutateAsync,
    discarding: discard.isPending,
    discardError: discard.error?.message ?? null,
  };
}
