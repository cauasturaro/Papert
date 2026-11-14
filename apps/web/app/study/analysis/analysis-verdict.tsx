"use client";

import type { Ref } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import { formatRelativeTime } from "@/lib/format/time";
import { AttemptFeedback } from "../attempt/attempt-feedback";
import { AttemptStatusBadge, statusLabel } from "../attempt/attempt-status";
import type { AskSeymour, OpenLocation } from "../attempt/feedback-actions";
import type { Workspace } from "../study-api";
import { sameFiles } from "../workspace/workspace-tree";
import { STUCK_PROMPT, failureExplanation, needsWorkCount } from "./analysis-state";
import type { Analysis } from "./use-analysis";

const verdictTitles: Record<string, string> = {
  approved: "Approved",
  needs_work: "Needs work",
  analysis_failed: "Couldn't analyze",
  syntax_error: "Fix the syntax errors",
};

export function AnalysisVerdict({
  latest, workspace, analysis, hasUnsavedChanges,
  onAskSeymour, onOpenLocation, headingRef,
}: {
  latest: Workspace["attempts"][number];
  workspace: Workspace | null | undefined;
  analysis: Analysis;
  hasUnsavedChanges: boolean;
  onAskSeymour?: AskSeymour;
  onOpenLocation?: OpenLocation;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const steps = workspace?.roadmap.definition.steps ?? [];
  const attempts = workspace?.attempts ?? [];
  const running = analysis.running;
  const latestStepIndex = latest
    ? steps.findIndex((step) => step.id === latest.stepId)
    : -1;
  const currentStep = workspace ? steps[workspace.currentStep] : undefined;
  const changedSince =
    !!latest &&
    !!workspace &&
    (hasUnsavedChanges || !sameFiles(latest.files, workspace.files));
  const stuck =
    !!currentStep &&
    latest?.result.status === "needs_work" &&
    latest.stepId === currentStep.id &&
    needsWorkCount(attempts, currentStep.id) >= 2;

  return (
    <article aria-labelledby="analysis-verdict" className="space-y-3">
      <div className="space-y-1">
        <h3
          id="analysis-verdict"
          ref={headingRef}
          tabIndex={-1}
          className="flex flex-wrap items-center gap-2 text-base font-semibold focus:outline-none"
        >
          {verdictTitles[latest.result.status] ??
            statusLabel(latest.result)}
          <AttemptStatusBadge result={latest.result} />
        </h3>

        <p className="text-xs text-muted-foreground">
          {latestStepIndex >= 0
            ? `Step ${latestStepIndex + 1} of ${steps.length} · `
            : ""}
          Analyzed {formatRelativeTime(latest.createdAt)}
        </p>
      </div>

      {changedSince && !running && (
        <Alert variant="warning" size="sm">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>Your code changed since this analysis.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!analysis.canAnalyze}
              onClick={() => void analysis.analyze()}
            >
              Check my solution again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {latest.result.status === "analysis_failed" && (
        <div className="space-y-2">
          <p>{failureExplanation(latest.result.reason)}</p>
          <Button
            type="button"
            size="sm"
            disabled={!analysis.canAnalyze}
            onClick={() => void analysis.analyze()}
          >
            Check my solution again
          </Button>
        </div>
      )}

      {stuck && onAskSeymour && (
        <div className="space-y-2 rounded-lg border border-primary/60 bg-primary/10 p-3">
          <h4 className="font-semibold">Stuck?</h4>
          <p>
            This step needed more work a few times. Seymour can teach the
            idea behind it step by step, without giving you the answer.
          </p>
          <Button
            type="button"
            size="sm"
            variant="soft"
            onClick={() =>
              onAskSeymour(STUCK_PROMPT, { mode: "teaching" })
            }
          >
            Learn it with Seymour
          </Button>
        </div>
      )}

      <AttemptFeedback
        key={latest.id}
        result={latest.result}
        challenge={latest.challenge}
        finalStep={latestStepIndex === steps.length - 1}
        attemptId={latest.id}
        onOpenLocation={onOpenLocation}
        onAskSeymour={onAskSeymour}
      />
    </article>
  );
}
