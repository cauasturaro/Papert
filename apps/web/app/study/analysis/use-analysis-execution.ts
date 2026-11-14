"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { errorKind } from "@/lib/api/learner-error";
import { isRunning, newerSnapshot } from "../execution/execution-state";
import { useExecutionProgress } from "../execution/use-execution-progress";
import { useStableCallback } from "../use-stable-callback";
import {
  cancelAnalysis,
  readAnalysis,
  workspaceExecutions,
  type AnalysisExecution,
} from "./analysis-api";
import { MAX_POLL_MS, POLL_GIVE_UP_MS } from "./analysis-state";

function usePageVisible() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    function update() {
      setVisible(document.visibilityState !== "hidden");
    }

    update();
    document.addEventListener("visibilitychange", update);

    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return visible;
}

export function useAnalysisExecution({
  workspaceId, onSettled, onRefresh,
}: {
  workspaceId: string;
  onSettled: (snapshot: AnalysisExecution) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [job, setJob] = useState<AnalysisExecution | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [stalled, setStalled] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const settledId = useRef<string | null>(null);
  const visible = usePageVisible();
  const settled = useStableCallback(onSettled);

  // A running analysis survives reloads; Core keeps every snapshot.
  useEffect(() => {
    let disposed = false;

    async function resume() {
      try {
        const jobs = await workspaceExecutions(workspaceId);
        const latest = jobs.find((job) => job.kind === "analysis");

        if (disposed || !latest || !isRunning(latest)) {
          return;
        }

        setJob(latest);
        setStartedAt(
          latest.createdAt ? Date.parse(latest.createdAt) : Date.now(),
        );
      } catch (failure) {
        if (!disposed) {
          setError(failure);
        }
      }
    }

    void resume();

    return () => {
      disposed = true;
    };
  }, [workspaceId]);

  // The retry wait ends on its own; Analyze is enabled again afterwards.
  useEffect(() => {
    if (retryAt === null) {
      return;
    }

    const timer = setTimeout(
      () => setRetryAt(null),
      Math.max(0, retryAt - Date.now()),
    );

    return () => clearTimeout(timer);
  }, [retryAt]);

  const progress = useExecutionProgress({
    executionId: job && isRunning(job) ? job.id : null,
    read: readAnalysis,
    enabled: !stalled,
    maxPollMs: MAX_POLL_MS,
  });

  const execution =
    job && progress.snapshot?.id === job.id
      ? newerSnapshot(job, progress.snapshot)
      : job;
  const executionId = execution?.id;
  const running = isRunning(execution);

  // Network failures are retried quietly; anything else is shown.
  const pollError =
    progress.error && errorKind(progress.error) !== "network"
      ? progress.error
      : null;
  const shownError = error ?? pollError;

  const settleOnce = useEffectEvent((snapshot: AnalysisExecution) => {
    if (settledId.current === snapshot.id) {
      return;
    }

    settledId.current = snapshot.id;
    void settled(snapshot);
  });

  useEffect(() => {
    const snapshot = progress.snapshot;

    if (snapshot && !isRunning(snapshot)) {
      settleOnce(snapshot);
    }
  }, [progress.snapshot]);

  // Polling pauses while the tab is hidden; after a few visible minutes the panel offers
  // "Check again" instead.
  useEffect(() => {
    if (!executionId || !running || stalled || !visible) {
      return;
    }

    const timer = setTimeout(() => setStalled(true), POLL_GIVE_UP_MS);

    return () => clearTimeout(timer);
  }, [executionId, running, stalled, visible]);

  async function cancel() {
    if (!execution || !running) {
      return;
    }

    try {
      const snapshot = await cancelAnalysis(execution.id);

      setJob((current) => newerSnapshot(current, snapshot));
      await onRefresh();
    } catch (failure) {
      setError(failure);
    }
  }

  function checkAgain() {
    setError(null);
    setStalled(false);
  }

  return {
    execution, running, stalled, startedAt, error: shownError,
    setJob, setError, setStalled, setStartedAt, retryAt, setRetryAt, cancel, checkAgain,
  };
}
