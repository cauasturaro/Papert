"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button/button";

const HINTS_KEY = "papert:revealed-hints:";

function readRevealed(attemptId: string | undefined) {
  if (!attemptId || typeof window === "undefined") {
    return 0;
  }

  try {
    const stored = Number(window.localStorage.getItem(HINTS_KEY + attemptId));

    return Number.isInteger(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function storeRevealed(attemptId: string | undefined, count: number) {
  if (!attemptId) {
    return;
  }

  try {
    window.localStorage.setItem(HINTS_KEY + attemptId, String(count));
  } catch {
    // Revealed hints are a convenience; they reset when storage is unavailable.
  }
}

/** From a general nudge to a specific pointer; revealed hints stay revealed for the attempt. */
export function HintLadder({
  hints,
  attemptId,
}: {
  hints: string[];
  attemptId?: string;
}) {
  const [shown, setShown] = useState(() => readRevealed(attemptId));
  const visible = Math.min(shown, hints.length);

  function revealNext() {
    const next = visible + 1;

    setShown(next);
    storeRevealed(attemptId, next);
  }

  return (
    <div className="space-y-2">
      <h4 className="font-semibold">
        Hints{" "}
        <span className="font-normal text-muted-foreground">
          ({visible} of {hints.length} shown)
        </span>
      </h4>

      {visible > 0 && (
        <ol className="list-inside list-decimal space-y-1">
          {hints.slice(0, visible).map((hint, index) => (
            <li key={index}>{hint}</li>
          ))}
        </ol>
      )}

      {visible < hints.length && (
        <Button type="button" size="sm" variant="outline" onClick={revealNext}>
          {visible === 0 ? "Show a hint" : "Show a more specific hint"}
        </Button>
      )}
    </div>
  );
}
