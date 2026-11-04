"use client";

import { Button } from "@/components/ui/button/button";
import { SourcesPanel } from "../sources/sources-panel";
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
}: {
  workspaceId: string;
  onBack: () => void;
  onStudy: (roadmapId: string) => void;
}) {
  const state = useDraft(workspaceId);

  let body = null;

  if (state.loading) {
    body = (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your draft…
      </p>
    );
  } else if (!state.draft) {
    body = (
      <p role="alert" className="text-sm text-destructive">
        {state.loadError ?? "This draft is no longer available."}
      </p>
    );
  } else {
    const roadmapId = state.draft.roadmap?.id;

    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <div className="h-[28rem] overflow-hidden rounded-lg border border-border lg:sticky lg:top-4 lg:h-[calc(100dvh-10rem)]">
          <SourcesPanel workspaceId={workspaceId} />
        </div>

        <GenerationPanel
          workspaceId={workspaceId}
          state={state}
          onStudy={() => {
            if (roadmapId) {
              onStudy(roadmapId);
            }
          }}
          onDiscarded={onBack}
        />
      </div>
    );
  }

  return (
    <SourceViewerProvider workspaceId={workspaceId}>
      <main className="flex-1 overflow-auto bg-muted/40 p-4 sm:p-6">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold">Personalized roadmap</h1>
            <Button variant="ghost" onClick={onBack}>
              All roadmaps
            </Button>
          </div>

          {body}
        </div>
      </main>
    </SourceViewerProvider>
  );
}
