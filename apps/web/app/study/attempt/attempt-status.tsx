"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge/badge";
import type { AttemptResult } from "../study-api";

const statusLabels: Record<AttemptResult["status"], string> = {
  not_evaluated: "Not analyzed",
  syntax_error: "Syntax errors",
  evaluating: "Analyzing",
  needs_work: "Needs work",
  approved: "Approved",
  analysis_failed: "Couldn't analyze",
};

// Red only for real errors in the code; "Needs work" is a learning state.
const statusVariants: Record<AttemptResult["status"], BadgeProps["variant"]> = {
  not_evaluated: "outline",
  syntax_error: "destructive",
  evaluating: "info",
  needs_work: "warning",
  approved: "success",
  analysis_failed: "outline",
};

export function statusLabel(result: AttemptResult) {
  return statusLabels[result.status] ?? "Unknown";
}

export function AttemptStatusBadge({ result }: { result: AttemptResult }) {
  return (
    <Badge size="sm" variant={statusVariants[result.status] ?? "outline"}>
      {statusLabel(result)}
    </Badge>
  );
}

export function nextAction(result: AttemptResult, finalStep: boolean) {
  if (result.status === "syntax_error") {
    return "Fix the syntax errors below, then analyze again.";
  }

  if (result.status === "needs_work") {
    return "Work on the unmet criteria, then analyze again. Seymour can help with any of them.";
  }

  if (result.status === "approved") {
    return finalStep
      ? "You completed this roadmap."
      : "The next step is unlocked. Continue with it.";
  }

  if (result.status === "analysis_failed") {
    return "Your progress did not change. Check your solution again.";
  }

  if (result.status === "evaluating") {
    return "Wait for Seymour to finish the analysis.";
  }

  return "Check your solution to get a verdict.";
}
