"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert/alert";
import { announce } from "@/lib/a11y/announcer";
import { formatResetTime } from "@/lib/format/time";
import { formatCount } from "@/lib/format/number";
import { statusLabel } from "../attempt/attempt-status";
import type { AskSeymour, OpenLocation } from "../attempt/feedback-actions";
import { AnswerFeedback } from "../feedback/answer-feedback";
import { useAnswerFeedback } from "../feedback/use-answer-feedback";
import type { Workspace } from "../study-api";
import { useNow } from "../use-now";
import { AnalysisStepper } from "./analysis-stepper";
import { analysesLeft, analysisPhase, latestSettledAttempt } from "./analysis-state";
import { AnalysisVerdict } from "./analysis-verdict";
import { AnalysisMessages } from "./analysis-messages";
import type { Analysis } from "./use-analysis";
import { useCachedWorkspace } from "./use-cached-workspace";

export type AnalysisPanelProps = {
  analysis: Analysis;
  // The saved workspace; read from the study cache when omitted.
  workspace?: Workspace;
  // Unsaved editor changes, so the verdict can say the code changed since.
  hasUnsavedChanges?: boolean;
  // Saves now; resolves false when saving failed.
  onSaveChanges?: () => Promise<boolean>;
  onOpenLocation?: OpenLocation;
  onAskSeymour?: AskSeymour;
  // `null` selects the current step.
  onSelectStep?: (stepId: string | null) => void;
};

export function AnalysisPanel({
  analysis,
  workspace: providedWorkspace,
  hasUnsavedChanges = false,
  onSaveChanges,
  onOpenLocation,
  onAskSeymour,
  onSelectStep,
}: AnalysisPanelProps) {
  const cached = useCachedWorkspace(analysis.workspaceId);
  const workspace = providedWorkspace ?? cached;
  const { execution, syntax, error, notice, running, stalled, quota, moment } =
    analysis;

  const waitingForRetry = analysis.retryAt !== null;
  const now = useNow(running || waitingForRetry ? 1000 : null);
  const verdictHeading = useRef<HTMLHeadingElement>(null);

  const completedId = execution?.status === "completed" ? execution.id : null;
  const feedback = useAnswerFeedback(completedId ? [completedId] : []);

  const attempts = workspace?.attempts ?? [];
  const latest = latestSettledAttempt(attempts);
  // A verdict this tab watched arrive takes focus once and is spoken once.
  const freshAttemptId = analysis.freshAttemptId;
  const freshIsLatest = !!freshAttemptId && latest?.id === freshAttemptId;

  const presentVerdict = useEffectEvent(() => {
    if (!latest) {
      return;
    }

    verdictHeading.current?.focus();

    if (moment && moment.nextStep !== null) {
      announce(
        `Step ${moment.approvedStep + 1} approved. Step ${moment.nextStep + 1} unlocked.`,
      );
    } else if (moment) {
      announce("Final step approved. Roadmap completed.");
    } else {
      announce(`Analysis finished: ${statusLabel(latest.result)}.`);
    }
  });

  // Only a new fresh attempt moves focus or speaks; later renders of the same verdict stay quiet.
  useEffect(() => {
    if (freshIsLatest) {
      presentVerdict();
    }
  }, [freshAttemptId, freshIsLatest]);

  useEffect(() => {
    if (running) {
      announce("Analysis started.");
    }
  }, [running]);

  const idle =
    !execution &&
    !syntax &&
    !error &&
    !notice &&
    !latest &&
    !analysis.completed;

  return (
    <section
      aria-label="Analysis"
      className="flex h-full min-h-0 flex-col bg-card"
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Analysis
        </h2>

        {quota && (
          <p className="ml-auto truncate text-xs text-muted-foreground">
            About {formatCount(analysesLeft(quota), "analysis", "analyses")}{" "}
            left · {formatResetTime(quota.resetsAt)}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-sm">
        {idle && (
          <p className="text-muted-foreground">
            Check my solution compares your saved code with this step&apos;s
            criteria. Papert first checks syntax for TypeScript, JavaScript,
            Python, YAML, Dockerfile, SQL (PostgreSQL) and JSON files; syntax
            errors are shown without calling Seymour. Then Seymour reviews your
            code and Papert records the official result.
          </p>
        )}

        {analysis.completed && (
          <Alert variant="info" size="sm">
            <AlertTitle>Roadmap completed</AlertTitle>
            <AlertDescription>
              There is nothing left to check. Seymour can still answer questions
              and teach you about any step.
            </AlertDescription>
          </Alert>
        )}

        {running && execution && (
          <AnalysisStepper
            phase={analysisPhase(execution)}
            elapsedMs={now - (analysis.startedAt ?? now)}
            stalled={stalled}
            onCancel={() => void analysis.cancel()}
            onCheckAgain={analysis.checkAgain}
          />
        )}

        <AnalysisMessages
          analysis={analysis}
          now={now}
          onSaveChanges={onSaveChanges}
          onOpenLocation={onOpenLocation}
          onSelectStep={onSelectStep}
        />

        {latest && !syntax && (
          <AnalysisVerdict
            latest={latest}
            workspace={workspace}
            analysis={analysis}
            hasUnsavedChanges={hasUnsavedChanges}
            onAskSeymour={onAskSeymour}
            onOpenLocation={onOpenLocation}
            headingRef={verdictHeading}
          />
        )}

        {completedId && freshIsLatest && (
          <AnswerFeedback
            executionId={completedId}
            subject="analysis"
            actions={feedback}
          />
        )}
      </div>
    </section>
  );
}
