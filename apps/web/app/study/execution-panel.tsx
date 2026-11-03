"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { executionRequest as request } from "./execution-api";
import type { Quota } from "./execution-api";
import { newerSnapshot, isRunning } from "./execution-state";
import type { Execution } from "./execution-state";

export function ExecutionPanel({
  workspaceId,
  revision,
  activeFile,
  selection,
}: {
  workspaceId: string;
  revision: number;
  activeFile?: string;
  selection?: { start: number; end: number };
}) {
  const [execution, setExecution] = useState<Execution | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("doubt");
  const [effort, setEffort] = useState("low");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState<{
    requestKey: string;
    prompt: string;
    kind: string;
    revision: number;
    mode: string;
    effort: string;
    activeFile?: string;
    selection?: { start: number; end: number };
  } | null>(null);

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

  return (
    <section className="space-y-4" aria-label="Seymour execution">
      <h2 className="text-xl font-semibold">Seymour</h2>
      <p className="text-sm">
        Ask about your saved code or learn one step at a time. Seymour reads
        your saved context without executing your code. Step approval is
        separate.
      </p>

      {quota && (
        <p className="text-sm" aria-label="Token quota">
          Tokens: {quota.used} used + {quota.reserved} reserved / {quota.limit}.
          Daily reset: 00:00 UTC. Each request reserves {quota.reservation}{" "}
          tokens for up to three attempts.
        </p>
      )}
      {blocked && (
        <p role="alert">Daily quota exhausted. Try again after 00:00 UTC.</p>
      )}
      <p role="status">{message}</p>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();

          void submit();
        }}
      >
        <label className="block" htmlFor="execution-kind">
          Tutor mode
        </label>
        <select
          id="execution-kind"
          className="auth-input"
          value={mode}
          disabled={busy || running || !!pending}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="doubt">Doubt — a focused hint</option>
          <option value="teaching">Teaching — step by step</option>
          <option value="review">
            Review — logic, contracts, structure and security
          </option>
          <option value="solution">
            Solution guidance — after three saved attempts
          </option>
        </select>

        <label className="block" htmlFor="execution-effort">
          Reasoning effort
        </label>
        <select
          id="execution-effort"
          className="auth-input"
          value={effort}
          disabled={busy || running || !!pending}
          onChange={(event) => setEffort(event.target.value)}
        >
          <option value="low">Low — direct response</option>
          <option value="medium">Medium — balanced reasoning</option>
          <option value="high">High — thinking enabled</option>
        </select>
        <p className="text-sm">
          Current file: {activeFile ?? "none"}. Solution guidance requires
          attempts on three different saved revisions of this step.
        </p>

        <label className="block" htmlFor="execution-prompt">
          Message about your saved revision {revision}
        </label>
        <textarea
          id="execution-prompt"
          className="auth-input"
          value={prompt}
          maxLength={2000}
          disabled={busy || running || !!pending}
          onChange={(event) => setPrompt(event.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || running || blocked || !quota || !prompt.trim()}
            type="submit"
          >
            {pending ? "Retry request" : "Send saved revision"}
          </Button>
          {running && (
            <Button
              disabled={busy}
              type="button"
              variant="outline"
              onClick={() => void cancel()}
            >
              Cancel
            </Button>
          )}
          {pending && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Edit request
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy || running}
            onClick={() => setRetry((value) => value + 1)}
          >
            Refresh
          </Button>
        </div>
      </form>

      {execution && (
        <div className="space-y-2 rounded-lg border border-current/15 p-3">
          <p role="status">Execution: {execution.status}</p>
          <p className="whitespace-pre-wrap text-sm" aria-live="polite">
            {execution.text}
          </p>
        </div>
      )}
    </section>
  );
}
