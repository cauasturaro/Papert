"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { executionRequest as request } from "../execution/execution-api";
import type { Execution } from "../execution/execution-state";
import { isRunning, newerSnapshot, quotaBlocked } from "../execution/execution-state";
import { useExecutionProgress } from "../execution/use-execution-progress";
import { useQuota } from "../execution/use-quota";
import { mentionedTargets, type MentionTarget } from "./mentions";
import { useConversationDraft } from "./use-conversation-draft";
import { useConversationScope } from "./use-conversation-scope";
import { useConversationTranscript } from "./use-conversation-transcript";
import { useSeymourSending } from "./use-seymour-sending";

/** Editor offsets (UTF-16) of the selected code; lines are 1-based and only for display. */
export type CodeSelection = {
  start: number;
  end: number;
  startLine?: number;
  endLine?: number;
};

export type SeymourRequest = {
  requestKey: string;
  prompt: string;
  kind: string;
  revision: number;
  mode: string;
  effort: string;
  activeFile?: string;
  selection?: { start: number; end: number };
  sourceIds?: string[];
  conversationId?: string;
};

/** A request the learner can send: the composer text or an earlier question asked again. */
export type Question = { prompt: string; mode: string; effort: string };

export type SeymourError = {
  message: string;
  // The failed request, kept with its key so a retry cannot create a duplicate.
  retry: SeymourRequest | null;
  // Epoch milliseconds before which sending again is pointless (rate limits).
  waitUntil: number | null;
};

export type { Connection } from "../execution/execution-progress";

function readExecution(executionId: string) {
  return request<Execution>(executionId);
}

/**
 * Seymour chat jobs of one conversation: restores its transcript, follows the latest job
 * (WebSocket plus HTTP reconciliation), sends requests with retries on network and server
 * failures, and tracks the quota. `conversationId` is undefined while
 * conversations load and null before the first one.
 */
export function useSeymour({
  workspaceId,
  conversationId,
  revision,
  activeFile,
  selection,
  sources,
  onCreated,
}: {
  workspaceId: string;
  conversationId: string | null | undefined;
  revision: number;
  activeFile?: string;
  selection?: CodeSelection;
  sources: MentionTarget[];
  onCreated: (execution: Execution) => void;
}) {
  const { prompt, setPrompt, adoptDraft } = useConversationDraft(workspaceId, conversationId);
  const isCurrent = useConversationScope(workspaceId, conversationId);
  const [mode, setMode] = useState("doubt");
  const [effort, setEffort] = useState("low");
  const [error, setError] = useState<SeymourError | null>(null);
  const [stopping, setStopping] = useState(false);
  const stoppingIdentity = `${workspaceId}:${conversationId}`;
  const [stoppingKey, setStoppingKey] = useState(stoppingIdentity);

  if (stoppingKey !== stoppingIdentity) {
    setStoppingKey(stoppingIdentity);
    setStopping(false);
  }

  const [reloadNonce, setReloadNonce] = useState(0);
  const [droppedSelection, setDroppedSelection] = useState<string | null>(null);
  const {
    job,
    setJob,
    history,
    setHistory,
    loading,
    earliest,
    loadingEarlier,
    loadEarlier,
    adoptConversation,
  } = useConversationTranscript({ workspaceId, conversationId, reloadNonce, isCurrent, setError });

  // An empty caret is not a selection; a dropped range stays dropped until it changes.
  const selectionKey = selection ? `${selection.start}:${selection.end}` : null;
  const sentSelection =
    activeFile &&
    selection &&
    selection.start !== selection.end &&
    selectionKey !== droppedSelection
      ? selection
      : undefined;

  // "Save and ask" sends right after a save, before this hook re-renders with the new revision.
  const latestRevision = useRef(revision);

  useLayoutEffect(() => {
    latestRevision.current = revision;
  }, [revision]);

  const quotaState = useQuota();
  const quota = quotaState.quota;
  const refreshQuota = quotaState.refresh;

  const progress = useExecutionProgress({
    executionId: job && isRunning(job) ? job.id : null,
    read: readExecution,
    live: true,
  });

  const execution =
    job && progress.snapshot?.id === job.id
      ? newerSnapshot(job, progress.snapshot)
      : job;
  const executionId = execution?.id;
  const running = isRunning(execution);

  const { sending, reconnecting, dispatch, retryFailed } = useSeymourSending({
    workspaceId,
    conversationId,
    isCurrent,
    execution,
    running,
    error,
    setError,
    setHistory,
    setJob,
    adoptConversation,
    adoptDraft,
    onCreated,
    refreshQuota,
    setPrompt,
  });

  // A settled answer changes the quota; refresh it once.
  useEffect(() => {
    if (!executionId || running) {
      return;
    }

    void refreshQuota();
  }, [executionId, running, refreshQuota]);

  // Coming back to the tab picks up answers and quota changes made elsewhere.
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState !== "visible" || running || sending) {
        return;
      }

      setReloadNonce((value) => value + 1);
    }

    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [running, sending]);

  function buildRequest(question: Question): SeymourRequest {
    const mentioned = mentionedTargets(question.prompt, sources).filter(
      (target) => target.kind !== "file",
    );
    const sourceIds = mentioned.map((source) => source.id);

    const selected = sentSelection
      ? { start: sentSelection.start, end: sentSelection.end }
      : undefined;

    return {
      requestKey: crypto.randomUUID(),
      prompt: question.prompt,
      kind: "chat",
      revision: latestRevision.current,
      mode: question.mode,
      effort: question.effort,
      activeFile,
      selection: selected,
      sourceIds: sourceIds.length > 0 ? sourceIds : undefined,
      conversationId: conversationId ?? undefined,
    };
  }

  /** Sends the composer text, or `question` when given (Ask again, Retry). */
  async function send(question?: Question) {
    const asked = question ?? { prompt, mode, effort };
    const text = asked.prompt.trim();

    if (!text || running || sending) {
      return false;
    }

    const payload = buildRequest({ ...asked, prompt: text });
    const sent = await dispatch(payload);

    // Keep anything typed while the request was on its way.
    if (sent && isCurrent() && !question) {
      setPrompt((current) => (current === asked.prompt ? "" : current));
    }

    return sent;
  }

  async function cancel() {
    if (!isCurrent() || !execution || !running) {
      return;
    }

    setStopping(true);

    try {
      const cancelled = await request<Execution>(`${execution.id}/cancel`, {});

      if (isCurrent()) {
        setJob(cancelled);
      }
    } catch (failure) {
      if (!isCurrent()) {
        return;
      }

      setError({
        message: toLearnerMessage(failure),
        retry: null,
        waitUntil: null,
      });
    } finally {
      if (isCurrent()) {
        setStopping(false);
      }
    }

    void refreshQuota();
  }

  // A running request holds its retry reservation until it settles, so only judge the quota while idle.
  const blocked = !running && !!quota && quotaBlocked(quota);

  return {
    execution,
    history,
    loading,
    // Older turns of this conversation exist on the server.
    hasEarlier: earliest.hasMore,
    loadingEarlier,
    loadEarlier,
    selection: sentSelection,
    dropSelection: () => setDroppedSelection(selectionKey),
    quota,
    prompt,
    setPrompt,
    mode,
    setMode,
    effort,
    setEffort,
    error,
    clearError: () => setError(null),
    sending,
    reconnecting,
    stopping,
    running,
    blocked,
    connection: progress.connection,
    reconnect: progress.reconnect,
    reload: () => setReloadNonce((value) => value + 1),
    send,
    retryFailed,
    cancel,
  };
}

export type SeymourActions = ReturnType<typeof useSeymour>;
