"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useNow } from "../use-now";
import { formatElapsed, GENERATION_PHASES, generationPhase } from "./generation-progress";

// Mounted only while a generation runs.
function useElapsed(startedAt: string | null) {
  const [seenAt] = useState(() => Date.now());
  const now = useNow(1000);

  // Core's start time when known, otherwise the moment this page saw the run.
  const reported = startedAt ? Date.parse(startedAt) : Number.NaN;
  const since = Number.isNaN(reported) ? seenAt : reported;

  return now - since;
}

export function GenerationProgress({
  progress,
  startedAt,
}: {
  progress: string;
  startedAt: string | null;
}) {
  const phase = generationPhase(progress);
  const elapsed = useElapsed(startedAt);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Seymour is creating your roadmap</p>
        <span
          className="text-sm text-muted-foreground tabular-nums"
          aria-label={`Elapsed time ${formatElapsed(elapsed)}`}
        >
          {formatElapsed(elapsed)}
        </span>
      </div>

      <ol className="space-y-2 text-sm">
        {GENERATION_PHASES.map((label, index) => {
          const done = index < phase;
          const current = index === phase;

          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-2",
                !done && !current && "text-muted-foreground",
                current && "font-medium",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-xs",
                  done && "border-success text-success",
                  current && "border-ring bg-primary/25",
                  !done && !current && "border-border",
                )}
              >
                {done ? <CheckIcon className="size-3" /> : index + 1}
              </span>
              {label}
              {done && <span className="sr-only">(done)</span>}
            </li>
          );
        })}
      </ol>

      <p className="text-sm text-muted-foreground">
        This usually takes under a minute. You can leave this page; Seymour
        keeps generating and the roadmap appears in{" "}
        <Link href="/study" className="underline underline-offset-4">
          your study space
        </Link>
        .
      </p>
    </div>
  );
}
