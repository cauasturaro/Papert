"use client";

import { useEffect, useState } from "react";
import { executionRequest as request } from "../execution-api";
import type { Quota } from "../execution-api";
import { newerSnapshot, isRunning } from "../execution-state";
import type { Execution } from "../execution-state";

export type CodeSelection = { start: number; end: number };

type SeymourRequest = {
  requestKey: string;
  prompt: string;
  kind: string;
  revision: number;
  mode: string;
  effort: string;
  activeFile?: string;
  selection?: CodeSelection;
};

/**
 * Seymour chat jobs for one workspace: restores the latest job, follows it
 * over WebSocket with HTTP polling as the recovery path, and tracks the quota.
 */
export function useSeymour({
  workspaceId,
  revision,
  activeFile,
  selection,
}: {
  workspaceId: string;
  revision: number;
  activeFile?: string;
  selection?: CodeSelection;
}) {
  const [execution, setExecution] = useState<Execution | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("doubt");
  const [effort, setEffort] = useState("low");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState<SeymourRequest | null>(null);
  const [sentPrompt, setSentPrompt] = useState("");

  useEffect(() => {
    let disposed = false;

    Promise.all([
      request<Execution[]>(`workspaces/${workspaceId}`),
      request<Quota>("quota"),
    ])
      .then(([jobs, currentQuota]) => {
        if (!disposed) {
          setExecution(jobs.find((job) => job.kind === "chat") ?? null);
          setQuota(currentQuota);
          setMessage("");
        }
      })
      .catch((error: Error) => {
        if (!disposed) {
          setMessage(error.message);
        }
      });

    return () => {
      disposed = true;
    };
  }, [workspaceId, retry]);

  const executionId = execution?.id;
  const running = isRunning(execution);

  useEffect(() => {
    if (!executionId || !running) {
      return;
    }

    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      try {
        const ticket = await request<{ url: string | null }>(
          `${executionId}/ticket`,
          {},
        );
        if (disposed || !ticket.url) {
          return;
        }

        socket = new WebSocket(ticket.url);
        socket.onopen = () =>
          socket?.send(JSON.stringify({ action: "resume" }));
        socket.onmessage = (event) => {
          try {
            const snapshot = JSON.parse(event.data) as Execution;
            if (
              !disposed &&
              snapshot.id === executionId &&
              typeof snapshot.sequence === "number"
            ) {
              setExecution((current) => newerSnapshot(current, snapshot));
            }
          } catch {
            // The persisted HTTP snapshot remains the recovery source.
          }
        };
        socket.onclose = () => {
          if (!disposed) {
            reconnect = setTimeout(() => void connect(), 3000);
          }
        };
      } catch {
        if (!disposed) {
          reconnect = setTimeout(() => void connect(), 5000);
        }
      }
    }

    async function refresh() {
      try {
        const [snapshot, currentQuota] = await Promise.all([
          request<Execution>(executionId!),
          request<Quota>("quota"),
        ]);
        if (!disposed) {
          setExecution((current) => newerSnapshot(current, snapshot));
          setQuota(currentQuota);
        }
      } catch (error) {
        if (!disposed) {
          setMessage((error as Error).message);
        }
      }
    }

    void connect();
    const poll = setInterval(() => void refresh(), 1500);

    return () => {
      disposed = true;
      clearInterval(poll);
      clearTimeout(reconnect);
      socket?.close();
    };
  }, [executionId, running]);

  useEffect(() => {
    if (!executionId || running) {
      return;
    }

    let disposed = false;
    request<Quota>("quota")
      .then((currentQuota) => {
        if (!disposed) {
          setQuota(currentQuota);
        }
      })
      .catch((error: Error) => {
        if (!disposed) {
          setMessage(error.message);
        }
      });

    return () => {
      disposed = true;
    };
  }, [executionId, running]);

  async function submit() {
    const payload = pending ?? {
      requestKey: crypto.randomUUID(),
      prompt,
      kind: "chat",
      revision,
      mode,
      effort,
      activeFile,
      selection,
    };
    setPending(payload);
    setBusy(true);
    setMessage("");

    try {
      const created = await request<Execution>(
        `workspaces/${workspaceId}`,
        payload,
      );
      setExecution(created);
      setPending(null);
      setSentPrompt(payload.prompt);

      const currentQuota = await request<Quota>("quota");
      setQuota(currentQuota);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!execution) {
      return;
    }

    setBusy(true);

    try {
      const cancelled = await request<Execution>(`${execution.id}/cancel`, {});
      setExecution(cancelled);

      const currentQuota = await request<Quota>("quota");
      setQuota(currentQuota);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const blocked =
    !!quota && quota.used + quota.reserved + quota.reservation > quota.limit;

  return {
    execution,
    quota,
    prompt,
    setPrompt,
    sentPrompt,
    mode,
    setMode,
    effort,
    setEffort,
    message,
    busy,
    running,
    blocked,
    pending: pending !== null,
    submit,
    cancel,
    discardPending: () => setPending(null),
    refresh: () => setRetry((value) => value + 1),
  };
}
