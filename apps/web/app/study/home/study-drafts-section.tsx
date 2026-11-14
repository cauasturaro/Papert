"use client";

import { ErrorPanel } from "@/components/ui/error-panel/error-panel";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { ACTIVE_DRAFT_LIMIT } from "../generation/drafts-api";
import { DraftList } from "./draft-list";
import type { useStudyHome } from "./use-study-home";

export function StudyDraftsSection({ home, onOpenDraft }: {
  home: ReturnType<typeof useStudyHome>;
  onOpenDraft: (workspaceId: string) => void;
}) {
  const { drafts, activeDrafts, atDraftLimit } = home;

  return (
    <section aria-labelledby="drafts-title" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="drafts-title"
          className="text-sm font-medium text-muted-foreground"
        >
          In preparation
        </h2>

        {drafts.data && (
          <p className="text-xs text-muted-foreground">
            {activeDrafts.length} of {ACTIVE_DRAFT_LIMIT} drafts
          </p>
        )}
      </div>

      {atDraftLimit && (
        <p className="text-sm text-muted-foreground">
          You can prepare up to {ACTIVE_DRAFT_LIMIT} roadmaps at a time.
          Generate or discard one to create another.
        </p>
      )}

      {drafts.error && (
        <ErrorPanel
          className="rounded-lg border border-border bg-card"
          title="Your drafts could not load"
          message={toLearnerMessage(drafts.error)}
          onRetry={() => void drafts.refetch()}
        />
      )}

      {drafts.data && drafts.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No roadmaps in preparation.
        </p>
      )}

      {drafts.data && drafts.data.length > 0 && (
        <DraftList drafts={drafts.data} onOpenDraft={onOpenDraft} />
      )}
    </section>
  );
}
