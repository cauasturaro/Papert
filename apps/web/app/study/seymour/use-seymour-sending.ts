"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  errorKind,
  isRetryable,
  retryAfterMs,
  toLearnerMessage,
} from "@/lib/api/learner-error";
import { executionRequest as request } from "../execution/execution-api";
import type { Execution } from "../execution/execution-state";
import type { SeymourError, SeymourRequest } from "./use-seymour";

const SEND_ATTEMPTS = 3;

function backoff(attempt: number) {
  return Math.min(15_000, 1000 * 2 ** attempt);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function useSeymourSending({
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
}: {
  workspaceId: string;
  conversationId: string | null | undefined;
  isCurrent: () => boolean;
  execution: Execution | null;
  running: boolean;
  error: SeymourError | null;
  setError: Dispatch<SetStateAction<SeymourError | null>>;
  setHistory: Dispatch<SetStateAction<Execution[]>>;
  setJob: Dispatch<SetStateAction<Execution | null>>;
  adoptConversation: (id: string) => void;
  adoptDraft: (id: string) => void;
  onCreated: (execution: Execution) => void;
  refreshQuota: () => Promise<void>;
  setPrompt: Dispatch<SetStateAction<string>>;
}) {
  const [sending, setSending] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const key = `${workspaceId}:${conversationId}`;
  const [sendingKey, setSendingKey] = useState(key);

  if (sendingKey !== key) {
    setSendingKey(key);
    setSending(false);
    setReconnecting(false);
  }

  async function post(payload: SeymourRequest) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        if (!isCurrent()) {
          throw new Error("Conversation changed");
        }

        return await request<Execution>(`workspaces/${workspaceId}`, payload);
      } catch (failure) {
        const transient =
          isRetryable(failure) && errorKind(failure) !== "rate_limited";

        if (!transient || attempt + 1 >= SEND_ATTEMPTS) {
          throw failure;
        }

        if (!isCurrent()) {
          throw failure;
        }

        setReconnecting(true);
        await wait(backoff(attempt));
      }
    }
  }

  async function dispatch(payload: SeymourRequest) {
    if (!isCurrent()) {
      return false;
    }

    setSending(true);
    setError(null);

    let created: Execution;

    try {
      created = await post(payload);
    } catch (failure) {
      if (!isCurrent()) {
        return false;
      }

      const delay = retryAfterMs(failure);
      const kind = errorKind(failure);

      setError({
        message: toLearnerMessage(failure),
        retry: isRetryable(failure) ? payload : null,
        waitUntil:
          kind === "rate_limited" && delay !== null ? Date.now() + delay : null,
      });

      return false;
    } finally {
      if (isCurrent()) {
        setSending(false);
        setReconnecting(false);
      }
    }

    if (!isCurrent()) {
      return false;
    }

    if (execution && execution.id !== created.id) {
      setHistory((past) => [...past, execution]);
    }

    if (!conversationId && created.conversationId) {
      adoptConversation(created.conversationId);
      adoptDraft(created.conversationId);
    }

    setJob(created);
    onCreated(created);

    void refreshQuota();

    return true;
  }

  async function retryFailed() {
    if (!error?.retry || running || sending) {
      return;
    }

    const sent = await dispatch(error.retry);

    if (sent && isCurrent()) {
      setPrompt((current) => (current === error.retry?.prompt ? "" : current));
    }
  }

  return { sending, reconnecting, dispatch, retryFailed };
}
