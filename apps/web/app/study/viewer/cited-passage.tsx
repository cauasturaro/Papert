"use client";

import { type Citation } from "./citations";

export function CitedPassage({ citation }: { citation: Citation }) {
  const passage = citation.quote ?? citation.excerpt;

  return (
    <aside
      aria-label="Cited passage"
      className="shrink-0 space-y-2 rounded-md border border-border bg-muted p-3 lg:w-72 lg:self-start"
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase">
        Cited passage
      </p>
      <p className="text-xs font-medium">{citation.cite}</p>
      <pre className="max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap lg:max-h-[60dvh]">
        {passage}
      </pre>
    </aside>
  );
}
