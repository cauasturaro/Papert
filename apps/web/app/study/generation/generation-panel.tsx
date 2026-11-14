"use client";

import { useState } from "react";
import Link from "next/link";
import { SparklesIcon, StopIcon } from "@/components/icons";
import { AlertDialog } from "@/components/ui/alert-dialog/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert/alert";
import { Badge } from "@/components/ui/badge/badge";
import { Button, buttonVariants } from "@/components/ui/button/button";
import { levelLabel } from "@/lib/roadmap";
import { GenerateBlockers } from "./generate-blockers";
import { GenerationProgress } from "./generation-progress-view";
import { SourceUseList } from "./source-use-list";
import { PublishAction } from "../../community/publish-action";
import type { useSources } from "../sources/use-sources";
import { RecommendationPanel } from "./recommendation-panel";
import { RoadmapPreview } from "./roadmap-preview";
import { pendingSources, sourceUses } from "./source-use";
import type { useDraft } from "./use-draft";
import { useDraftRecommendation } from "./use-draft-recommendation";

export function GenerationPanel({
  state,
  sources,
  onStudy,
  onDiscarded,
  starting = false,
  startError = null,
}: {
  state: ReturnType<typeof useDraft>;
  sources: ReturnType<typeof useSources>;
  onStudy: () => void;
  onDiscarded: () => void;
  starting?: boolean;
  startError?: string | null;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const draft = state.draft!;
  const recommendation = useDraftRecommendation(draft);

  const roadmap = draft.roadmap;
  const stepIds = roadmap?.definition.steps.map((step) => step.id) ?? [];
  const uses = sourceUses(sources.sources, { ...draft, stepIds });
  const pending = pendingSources(sources.sources, sources.stalledSourceIds);
  const stalled = sources.stalledSourceIds.length;
  const level = levelLabel(draft.level);
  const generated = draft.status === "generated";
  const running = draft.status === "generating";
  // Core rejects a generation until the learner has seen the community options.
  const chosen = draft.canGenerate;

  async function discard() {
    try {
      await state.discard();
      onDiscarded();
    } catch {
      // The dialog stays open and shows the error.
    }
  }

  function generate() {
    void state.generate().catch(() => undefined);
  }

  let generateLabel = "Generate roadmap";

  if (draft.status === "failed") {
    generateLabel = "Try again";
  }

  return (
    <section aria-label="Roadmap generation" className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{level}</Badge>
          {generated && <Badge variant="success">Generated</Badge>}
        </div>
        <p className="text-lg">{draft.goal}</p>
      </div>

      {!generated && <RecommendationPanel recommendation={recommendation} />}

      {!generated && (
        <div className="space-y-3">
          {!running && (
            <GenerateBlockers
              chosen={chosen}
              pending={pending}
              stalled={stalled}
            />
          )}

          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button
                variant="outline"
                loading={state.cancelling}
                onClick={state.cancel}
              >
                <StopIcon />
                Cancel generation
              </Button>
            ) : (
              <Button
                loading={state.generating}
                disabled={pending > 0 || !chosen}
                onClick={generate}
              >
                <SparklesIcon />
                {generateLabel}
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={() => setConfirmDiscard(true)}
              disabled={running}
            >
              Discard draft
            </Button>
          </div>

          {/* Seymour's own wording goes to screen readers once per change. */}
          <p role="status" aria-live="polite" className="sr-only">
            {running ? state.progress || "Waiting for Seymour…" : ""}
          </p>

          {running && (
            <GenerationProgress
              progress={state.progress}
              startedAt={state.startedAt}
            />
          )}

          {state.cancelError && (
            <Alert variant="destructive" size="sm" role="alert">
              <AlertTitle>The generation was not cancelled</AlertTitle>
              <AlertDescription>{state.cancelError}</AlertDescription>
            </Alert>
          )}

          {state.generateError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{state.generateError}</AlertDescription>
            </Alert>
          )}

          {draft.failure && (
            <Alert
              variant={
                draft.failure.reason === "cancelled" ? "default" : "destructive"
              }
            >
              <AlertTitle>
                {draft.failure.reason === "cancelled"
                  ? "Generation cancelled"
                  : "No roadmap was created"}
              </AlertTitle>
              <AlertDescription>{draft.failure.message}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Your sources</h2>
        <SourceUseList uses={uses} />
      </div>

      {roadmap && (
        <>
          <RoadmapPreview roadmap={roadmap} evidence={draft.evidence} />

          {/* Stays in reach while the learner reads a long roadmap. */}
          <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" loading={starting} onClick={onStudy}>
                Start studying
              </Button>

              <PublishAction
                roadmap={{ id: roadmap.id, title: roadmap.definition.title }}
              />

              <Link
                href="/study/new"
                className={buttonVariants({ variant: "ghost" })}
              >
                Create another
              </Link>
            </div>

            {startError && (
              <Alert variant="destructive" size="sm" role="alert">
                <AlertTitle>Your workspace did not open</AlertTitle>
                <AlertDescription>{startError}</AlertDescription>
              </Alert>
            )}
          </div>
        </>
      )}

      <AlertDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this draft?"
        description="The draft and every source you added to it are deleted. Seymour can no longer use them."
        confirmLabel="Discard"
        pending={state.discarding}
        error={state.discardError ?? undefined}
        onConfirm={() => void discard()}
      />
    </section>
  );
}
