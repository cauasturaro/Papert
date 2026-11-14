"use client";

import { useState } from "react";
import { OfflineAlert } from "@/components/app/offline-alert";
import { Button } from "@/components/ui/button/button";
import { CardSkeleton } from "@/components/ui/card/card-skeleton";
import { ErrorPanel } from "@/components/ui/error-panel/error-panel";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { cn } from "@/lib/utils";
import { SourcesPanelView } from "../sources/sources-panel";
import { useSources } from "../sources/use-sources";
import { SourceViewerProvider } from "../viewer/source-viewer-context";
import { GenerationPanel } from "./generation-panel";
import { useDraft } from "./use-draft";

/**
 * A preparation workspace: sources uploaded here stay with the roadmap it generates,
 * so the learner keeps them, unchanged and private, while studying.
 */
export function DraftPage({
  workspaceId,
  onBack,
  onStudy,
  starting = false,
  startError = null,
}: {
  workspaceId: string;
  onBack: () => void;
  onStudy: (roadmapId: string) => void;
  // The caller is opening the generated roadmap's workspace.
  starting?: boolean;
  startError?: string | null;
}) {
  const state = useDraft(workspaceId);
  const sources = useSources(workspaceId);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  let body = null;

  if (state.loading) {
    body = (
      <div
        aria-busy="true"
        aria-label="Loading your draft"
        className="space-y-4"
      >
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  } else if (!state.draft) {
    const message = state.loadError
      ? toLearnerMessage(state.loadError)
      : "This draft is no longer available. It may have been discarded.";

    body = (
      <ErrorPanel
        className="rounded-lg border border-border bg-card"
        title="This draft could not be opened"
        message={message}
        onRetry={state.loadError ? () => void state.refetch() : undefined}
        actions={
          <Button size="sm" variant="outline" onClick={onBack}>
            All roadmaps
          </Button>
        }
      />
    );
  } else {
    const roadmapId = state.draft.roadmap?.id;
    const sourceCount = sources.sources.length;

    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        {/* On phones the goal, community check and Generate come first; sources fold away. */}
        <div className="order-2 space-y-2 lg:order-1">
          <Button
            variant="outline"
            className="w-full justify-between lg:hidden"
            aria-expanded={sourcesOpen}
            aria-controls="draft-sources"
            onClick={() => setSourcesOpen(!sourcesOpen)}
          >
            <span>
              {sourceCount === 0 ? "Add sources" : `Sources (${sourceCount})`}
            </span>
            <span className="text-muted-foreground">
              {sourcesOpen ? "Hide" : "Show"}
            </span>
          </Button>

          <div
            id="draft-sources"
            className={cn(
              "h-[28rem] overflow-hidden rounded-lg border border-border lg:sticky lg:top-4 lg:block lg:h-[calc(100dvh-10rem)]",
              !sourcesOpen && "hidden",
            )}
          >
            <SourcesPanelView sources={sources} />
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <GenerationPanel
            state={state}
            sources={sources}
            starting={starting}
            startError={startError}
            onStudy={() => {
              if (roadmapId) {
                onStudy(roadmapId);
              }
            }}
            onDiscarded={onBack}
          />
        </div>
      </div>
    );
  }

  return (
    <SourceViewerProvider workspaceId={workspaceId}>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-auto bg-muted/40 p-4 sm:p-6"
      >
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold">Personalized roadmap</h1>
            <Button variant="ghost" onClick={onBack}>
              All roadmaps
            </Button>
          </div>

          <OfflineAlert />

          {body}
        </div>
      </main>
    </SourceViewerProvider>
  );
}
