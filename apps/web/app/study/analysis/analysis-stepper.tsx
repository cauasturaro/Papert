"use client";

import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";
import type { AnalysisPhase } from "./analysis-state";

const PHASES: { id: AnalysisPhase; label: string }[] = [
  { id: "queued", label: "Queued" },
  { id: "checking", label: "Running checks" },
  { id: "writing", label: "Writing feedback" },
];

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");

  return `${minutes}:${rest}`;
}

/** Where a running analysis is, how long it has taken, and a way to stop it. */
export function AnalysisStepper({
  phase,
  elapsedMs,
  stalled,
  onCancel,
  onCheckAgain,
}: {
  phase: AnalysisPhase;
  elapsedMs: number;
  stalled: boolean;
  onCancel: () => void;
  onCheckAgain: () => void;
}) {
  const current = PHASES.findIndex((item) => item.id === phase);

  return (
    <div className="space-y-3 rounded-lg border border-info/40 p-3">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {PHASES.map((item, index) => {
          const done = index < current;
          const active = index === current;

          return (
            <li
              key={item.id}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5",
                active
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full",
                  done && "bg-success",
                  active && "animate-pulse bg-info motion-reduce:animate-none",
                  !done && !active && "bg-border",
                )}
              />
              {item.label}
              {done && <span className="sr-only"> (done)</span>}
            </li>
          );
        })}
      </ol>

      {stalled ? (
        <p className="text-sm">
          Still working… This is taking longer than usual. Check again in a
          moment.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Elapsed <span className="font-mono">{formatElapsed(elapsedMs)}</span>.
          Most analyses take under a minute.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {stalled && (
          <Button type="button" size="sm" onClick={onCheckAgain}>
            Check again
          </Button>
        )}

        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel analysis
        </Button>
      </div>
    </div>
  );
}
