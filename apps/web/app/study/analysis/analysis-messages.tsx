"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import { errorKind, isRetryable, toLearnerMessage } from "@/lib/api/learner-error";
import { formatWait } from "@/lib/format/time";
import { SyntaxDiagnostics } from "../attempt/syntax-diagnostics";
import type { OpenLocation } from "../attempt/feedback-actions";
import type { Analysis } from "./use-analysis";

export function AnalysisMessages({
  analysis, now, onSaveChanges, onOpenLocation, onSelectStep,
}: {
  analysis: Analysis;
  now: number;
  onSaveChanges?: () => Promise<boolean>;
  onOpenLocation?: OpenLocation;
  onSelectStep?: (stepId: string | null) => void;
}) {
  const { moment, notice, error, syntax } = analysis;
  const waitingForRetry = analysis.retryAt !== null;
  const [saving, setSaving] = useState(false);

  async function saveAndAnalyze() {
    if (!onSaveChanges) {
      return;
    }

    setSaving(true);

    const saved = await onSaveChanges();

    setSaving(false);

    if (saved) {
      await analysis.analyze();
    }
  }

  return (
    <>
      {moment && (
        <Alert variant="success" size="sm">
          <AlertTitle>
            {moment.nextStep !== null
              ? `Step ${moment.approvedStep + 1} approved · Step ${moment.nextStep + 1} unlocked`
              : `Step ${moment.approvedStep + 1} approved · Roadmap completed`}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {moment.nextStep !== null && onSelectStep && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  analysis.dismissMoment();
                  onSelectStep(null);
                }}
              >
                Go to step {moment.nextStep + 1}
              </Button>
            )}

            {moment.nextStep === null && (
              <span>
                Every step is approved. Open the Challenge panel for what to
                do next.
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {notice === "unchanged" && (
        <Alert variant="info" size="sm">
          <AlertTitle>Your code has not changed</AlertTitle>
          <AlertDescription>
            This version was already checked, so the result below is still
            current. Change your code, then check it again.
          </AlertDescription>
        </Alert>
      )}

      {notice === "not_saved" && (
        <Alert variant="warning" size="sm">
          <AlertTitle>Save your changes before checking</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Papert checks your saved code, and your latest changes could not
              be saved. Check the save status at the top, fix any problem it
              shows, then try again.
            </p>

            {onSaveChanges && (
              <Button
                type="button"
                size="sm"
                loading={saving}
                onClick={() => void saveAndAnalyze()}
              >
                Save and check
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {error !== null && (
        <Alert
          variant={
            errorKind(error) === "rate_limited" ? "warning" : "destructive"
          }
          size="sm"
          role="alert"
        >
          <AlertTitle>The check could not start</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{toLearnerMessage(error)}</p>

            {waitingForRetry && (
              <p>
                You can check again in {formatWait(analysis.retryAt! - now)}.
              </p>
            )}

            {isRetryable(error) && !waitingForRetry && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!analysis.canAnalyze}
                onClick={() => void analysis.analyze()}
              >
                Check my solution again
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {syntax && (
        <Alert variant="destructive" size="sm" role="alert">
          <AlertTitle>
            Fix these syntax errors before Seymour analyzes your code
          </AlertTitle>
          <AlertDescription className="text-foreground">
            <SyntaxDiagnostics
              syntax={syntax}
              onOpenLocation={onOpenLocation}
            />
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
