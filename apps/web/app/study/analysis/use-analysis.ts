"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENGAGEMENT_KEY } from "../../profile/engagement-keys";
import { executionRequest as request } from "../execution-api";
import { isRunning, newerSnapshot } from "../execution-state";
import type { Execution } from "../execution-state";
import type { SyntaxReport } from "../study-api";

type SyntaxRejection = { status: "syntax_error"; syntax: SyntaxReport };

/**
 * Saves the draft, runs the syntax gate and follows the Seymour analysis job
 * until it settles. Settling refreshes the workspace so progress updates.
 */
export function useAnalysis({
  workspaceId,
  prepare,
  onSettled,
}: {
  workspaceId: string;
  prepare: () => Promise<number | null>;
  onSettled: () => Promise<void>;
}) {
  const [execution, setExecution] = useState<Execution | null>(null);
  const [syntax, setSyntax] = useState<SyntaxReport | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const settled = useRef(onSettled);
  const queryClient = useQueryClient();

  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    let disposed = false;

    request<Execution[]>(`workspaces/${workspaceId}`)
      .then((jobs) => {
        const latest = jobs.find((job) => job.kind === "analysis");

        if (!disposed && latest && isRunning(latest)) {
          setExecution(latest);
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
  }, [workspaceId]);

  const executionId = execution?.id;
  const running = isRunning(execution);

  // Core persists every snapshot, so polling recovers progress after reloads.
  useEffect(() => {
    if (!executionId || !running) {
      return;
    }

    let disposed = false;

    const poll = setInterval(async () => {
      try {
        const snapshot = await request<Execution>(executionId);
        if (disposed) {
          return;
        }

        setExecution((current) => newerSnapshot(current, snapshot));

        if (!isRunning(snapshot)) {
          await settled.current();

          // A finished analysis may add a study day or a badge.
          void queryClient.invalidateQueries({ queryKey: ENGAGEMENT_KEY });
        }
      } catch (error) {
        if (!disposed) {
          setMessage((error as Error).message);
        }
      }
    }, 1500);

    return () => {
      disposed = true;
      clearInterval(poll);
    };
  }, [executionId, running, queryClient]);

  async function analyze() {
    setBusy(true);
    setMessage("");
    setSyntax(null);

    try {
      const revision = await prepare();
      if (revision === null) {
        setMessage("Save your changes before analyzing.");
        return;
      }

      const created = await request<Execution | SyntaxRejection>(
        `workspaces/${workspaceId}`,
        { requestKey: crypto.randomUUID(), kind: "analysis", revision },
      );

      if (created.status === "syntax_error") {
        setSyntax((created as SyntaxRejection).syntax);
        setExecution(null);
        await onSettled();
        return;
      }

      setExecution(created as Execution);
      await onSettled();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return { execution, syntax, message, busy, running, analyze };
}
