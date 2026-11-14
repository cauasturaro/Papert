"use client";

import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { type RoadmapDraft } from "../generation/drafts-api";

const DRAFT_STATUS: Record<string, string> = {
  open: "Ready to generate",
  generating: "Generating…",
  failed: "Generation failed",
};

export function DraftList({
  drafts,
  onOpenDraft,
}: {
  drafts: RoadmapDraft[];
  onOpenDraft: (workspaceId: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {drafts.map((draft) => (
        <li
          key={draft.workspaceId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
        >
          <div className="min-w-0 space-y-1">
            <p className="truncate">{draft.goal}</p>
            <Badge
              size="sm"
              variant={draft.status === "failed" ? "warning" : "secondary"}
            >
              {DRAFT_STATUS[draft.status] ?? draft.status}
            </Badge>
          </div>

          <Button
            variant="outline"
            onClick={() => onOpenDraft(draft.workspaceId)}
          >
            Continue
          </Button>
        </li>
      ))}
    </ul>
  );
}
