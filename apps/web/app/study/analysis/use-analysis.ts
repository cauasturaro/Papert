"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  errorKind,
  retryAfterMs,
  toLearnerMessage,
} from "@/lib/api/learner-error";
import { ENGAGEMENT_KEY } from "../../profile/engagement-keys";
import { studyKeys } from "../study-keys";
import { useQuota } from "../execution/use-quota";
import type { SyntaxReport, Workspace } from "../study-api";
import {
  startAnalysis,
  isSyntaxRejection,
  type AnalysisExecution,
} from "./analysis-api";
import {
  approvalOf,
  alreadyAnalyzed,
  type ApprovalMoment,
} from "./analysis-eligibility";
import { useAnalysisExecution } from "./use-analysis-execution";
export type { ApprovalMoment } from "./analysis-eligibility";
import { useCachedWorkspace } from "./use-cached-workspace";

export type AnalysisNotice = "unchanged" | "not_saved" | "completed" | null;

/**
 * Saves the draft, runs the syntax gate and follows the Seymour analysis job until it
 * settles. Settling refreshes the workspace so the verdict and progress update.
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
  const [syntax, setSyntax] = useState<SyntaxReport | null>(null);
  const [notice, setNotice] = useState<AnalysisNotice>(null);
  const [busy, setBusy] = useState(false);
  const [freshAttemptId, setFreshAttemptId] = useState<string | null>(null);
  const [moment, setMoment] = useState<ApprovalMoment | null>(null);
  const settled = useRef(onSettled);
  const queryClient = useQueryClient();
  const workspace = useCachedWorkspace(workspaceId);
  const { quota, refresh: refreshQuota } = useQuota();

  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  const cachedWorkspace = useCallback(() => {
    return queryClient.getQueryData<Workspace>(
      studyKeys.workspace(workspaceId),
    );
  }, [queryClient, workspaceId]);

  const settle = useCallback(
    async (snapshot: AnalysisExecution) => {
      await settled.current();

      // A finished analysis may add a study day or a badge.
      void queryClient.invalidateQueries({ queryKey: ENGAGEMENT_KEY });
      void refreshQuota();

      const attemptId = snapshot.attemptId ?? null;

      setFreshAttemptId(attemptId);
      setMoment(approvalOf(cachedWorkspace(), attemptId));
    },
    [cachedWorkspace, queryClient, refreshQuota],
  );

  const lifecycle = useAnalysisExecution({
    workspaceId,
    onSettled: settle,
    onRefresh: onSettled,
  });
  const {
    execution, running, stalled, startedAt, error: shownError,
    setJob, setError, setStalled, setStartedAt, retryAt, setRetryAt, cancel, checkAgain,
  } = lifecycle;

  const steps = workspace?.roadmap.definition.steps ?? [];
  const completed = !!workspace && workspace.currentStep >= steps.length;
  const waitingForRetry = retryAt !== null;
  const canAnalyze =
    !busy && !running && !completed && !waitingForRetry && !stalled;

  async function analyze() {
    if (completed) {
      setNotice("completed");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    setSyntax(null);
    setStalled(false);
    setMoment(null);

    try {
      const revision = await prepare();

      if (revision === null) {
        setNotice("not_saved");
        return;
      }

      if (alreadyAnalyzed(cachedWorkspace())) {
        setNotice("unchanged");
        return;
      }

      const created = await startAnalysis(workspaceId, revision);

      if (isSyntaxRejection(created)) {
        setSyntax(created.syntax);
        setJob(null);
        await onSettled();

        return;
      }

      setJob(created);
      setStartedAt(Date.now());
      setRetryAt(null);

      await onSettled();
    } catch (failure) {
      const wait = retryAfterMs(failure);

      setError(failure);

      if (errorKind(failure) === "rate_limited" && wait !== null) {
        setRetryAt(Date.now() + wait);
      }

      const message = failure instanceof Error ? failure.message : "";
      const repeated =
        errorKind(failure) === "conflict" && /already analyzed/i.test(message);

      if (repeated) {
        setError(null);
        setNotice("unchanged");
      }
    } finally {
      setBusy(false);
    }
  }

  return {
    workspaceId,
    execution,
    syntax,
    error: shownError,
    // Learner copy of the last failure, kept for callers that show one line.
    message: shownError ? toLearnerMessage(shownError) : "",
    notice,
    busy,
    running,
    stalled,
    startedAt,
    retryAt,
    quota,
    completed,
    canAnalyze,
    freshAttemptId,
    moment,
    dismissMoment: () => setMoment(null),
    dismissNotice: () => setNotice(null),
    analyze,
    cancel,
    checkAgain,
  };
}

export type Analysis = ReturnType<typeof useAnalysis>;
