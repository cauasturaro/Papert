"use client";

import { Button } from "@/components/ui/button/button";
import { Progress } from "@/components/ui/progress/progress";
import { formatRelativeTime } from "@/lib/format/time";
import { StartError } from "./start-error";

export function ContinueHero({
  title,
  stepTitle,
  stepNumber,
  stepCount,
  lastActivityAt,
  starting,
  error,
  onContinue,
}: {
  title: string;
  stepTitle: string | null;
  stepNumber: number;
  stepCount: number;
  lastActivityAt: string | null;
  starting: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  const completed = stepNumber > stepCount;
  const approved = Math.min(stepNumber - 1, stepCount);

  let position = `Step ${stepNumber} of ${stepCount}`;

  if (stepTitle) {
    position = `${position}: ${stepTitle}`;
  }

  if (completed) {
    position = `All ${stepCount} steps approved`;
  }

  return (
    <section
      aria-labelledby="continue-title"
      className="space-y-4 rounded-lg border border-ring/50 bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          Continue where you left off
        </p>
        <h2 id="continue-title" className="text-xl font-semibold">
          {title}
        </h2>
        <p className="text-sm">{position}</p>
      </div>

      <div className="space-y-1">
        <Progress
          size="sm"
          max={stepCount}
          value={approved}
          aria-label={`${title}: ${approved} of ${stepCount} steps approved`}
        />
        <p className="text-xs text-muted-foreground">
          {approved} of {stepCount} steps approved
          {lastActivityAt && (
            <> · Last studied {formatRelativeTime(lastActivityAt)}</>
          )}
        </p>
      </div>

      <Button size="lg" loading={starting} onClick={onContinue}>
        Continue studying
      </Button>

      {error && <StartError message={error} />}
    </section>
  );
}
