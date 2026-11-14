"use client";

import { cn } from "@/lib/utils";
import { diffFiles } from "./line-diff";

export type Files = Record<string, string>;

const DIFF_MARKERS = { added: "+", removed: "-", same: " " } as const;

export function DiffView({ before, after }: { before: Files; after: Files }) {
  const changes = diffFiles(before, after);

  if (changes.length === 0) {
    return (
      <p className="text-muted-foreground">
        The files are the same as in the previous attempt.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {changes.map((change) => (
        <div key={change.path} className="space-y-1">
          <p className="font-mono text-xs">
            {change.path}{" "}
            <span className="text-muted-foreground">({change.change})</span>
          </p>
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted p-2 font-mono text-xs">
            {change.lines.map((line, index) => {
              const marker = DIFF_MARKERS[line.kind];

              return (
                <div
                  key={index}
                  className={cn(
                    line.kind === "added" && "bg-success/15",
                    line.kind === "removed" && "bg-destructive/10",
                  )}
                >
                  <span aria-hidden="true">{marker} </span>
                  {line.kind !== "same" && (
                    <span className="sr-only">
                      {line.kind === "added" ? "Added: " : "Removed: "}
                    </span>
                  )}
                  {line.text}
                </div>
              );
            })}
          </pre>
        </div>
      ))}
    </div>
  );
}
