import type { Workspace } from "../study-api";
import { sameFiles } from "../workspace/workspace-tree.ts";
import { latestSettledAttempt } from "./analysis-state.ts";

/** An approval this tab watched settle: the approved step and the one it unlocked. */
export type ApprovalMoment = {
  attemptId: string;
  approvedStep: number;
  nextStep: number | null;
};

export function approvalOf(
  workspace: Workspace | undefined,
  attemptId: string | null | undefined,
): ApprovalMoment | null {
  if (!workspace || !attemptId) {
    return null;
  }

  const attempt = workspace.attempts.find((item) => item.id === attemptId);
  if (attempt?.result.status !== "approved") {
    return null;
  }

  const steps = workspace.roadmap.definition.steps;
  const approvedStep = steps.findIndex((step) => step.id === attempt.stepId);
  const nextStep = approvedStep + 1 < steps.length ? approvedStep + 1 : null;

  return { attemptId, approvedStep, nextStep };
}

// Same saved code as the latest verdict on this step: show it again instead of spending quota.
export function alreadyAnalyzed(saved: Workspace | undefined) {
  if (!saved) {
    return false;
  }

  const stepId = saved.roadmap.definition.steps[saved.currentStep]?.id;
  const latest = latestSettledAttempt(saved.attempts, stepId);

  if (!latest) {
    return false;
  }

  const verdict =
    latest.result.status === "approved" ||
    latest.result.status === "needs_work";

  return verdict && sameFiles(latest.files, saved.files);
}
