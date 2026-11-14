"use client";

import { type SourceUse } from "./source-use";

const TONE_CLASS: Record<SourceUse["tone"], string> = {
  used: "text-success",
  neutral: "text-muted-foreground",
  info: "text-info",
  warning: "text-warning",
};

export function SourceUseList({ uses }: { uses: SourceUse[] }) {
  if (uses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No sources yet. Seymour will design the roadmap from your goal alone.
      </p>
    );
  }

  return (
    <ul aria-label="How your sources are used" className="space-y-1 text-sm">
      {uses.map((use) => (
        <li key={use.id} className="flex flex-wrap gap-x-2">
          <span className="font-mono text-xs leading-5">{use.filename}</span>
          <span className={TONE_CLASS[use.tone]}>{use.label}</span>
        </li>
      ))}
    </ul>
  );
}
