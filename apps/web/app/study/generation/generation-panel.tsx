"use client";

import { useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert/alert";
import { AlertDialog } from "@/components/ui/alert-dialog/alert-dialog";
import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { SparklesIcon, StopIcon } from "@/components/icons";
import { useSources } from "../sources/use-sources";
import { LEVELS } from "./drafts-api";
import { RoadmapPreview } from "./roadmap-preview";
import { pendingSources, sourceUses, type SourceUse } from "./source-use";
import type { useDraft } from "./use-draft";

const TONE_CLASS: Record<SourceUse["tone"], string> = {
  used: "text-success",
  neutral: "text-muted-foreground",
  warning: "text-destructive",
};

function SourceUseList({ uses }: { uses: SourceUse[] }) {
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

/** Goal summary, generation actions and, once generated, the roadmap preview. */
export function GenerationPanel({
  workspaceId,
  state,
  onStudy,
  onDiscarded,
}: {
  workspaceId: string;
  state: ReturnType<typeof useDraft>;
  onStudy: () => void;
  onDiscarded: () => void;
}) {
  const sources = useSources(workspaceId);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const draft = state.draft!;

  const roadmap = draft.roadmap;
  const stepIds = roadmap?.definition.steps.map((step) => step.id) ?? [];
  const uses = sourceUses(sources.sources, { ...draft, stepIds });
  const pending = pendingSources(sources.sources);
  const level = LEVELS.find((option) => option.value === draft.level);
  const generated = draft.status === "generated";

  async function discard() {
    try {
      await state.discard();
      onDiscarded();
    } catch {
      // The dialog stays open and shows the error.
    }
  }

  return (
    <section aria-label="Roadmap generation" className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{level?.label}</Badge>
          {generated && <Badge variant="success">Generated</Badge>}
        </div>
        <p className="text-lg">{draft.goal}</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Your sources</h3>
        <SourceUseList uses={uses} />
      </div>

      {!generated && (
        <div className="space-y-3">
          {pending > 0 && (
            <p className="text-sm text-muted-foreground">
              Wait until every source finishes processing, or remove it, before
              generating.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {draft.status === "generating" ? (
              <Button
                variant="outline"
                onClick={() => state.cancel()}
                disabled={state.cancelling}
              >
                <StopIcon />
                Cancel generation
              </Button>
            ) : (
              <Button
                onClick={() => void state.generate().catch(() => undefined)}
                disabled={state.generating || pending > 0}
              >
                <SparklesIcon />
                {draft.status === "failed" ? "Try again" : "Generate roadmap"}
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={() => setConfirmDiscard(true)}
              disabled={draft.status === "generating"}
            >
              Discard draft
            </Button>
          </div>

          <p role="status" aria-live="polite" className="text-sm">
            {draft.status === "generating"
              ? state.progress || "Waiting for Seymour…"
              : ""}
          </p>

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

      {roadmap && (
        <>
          <RoadmapPreview roadmap={roadmap} evidence={draft.evidence} />

          <Button size="lg" onClick={onStudy}>
            Start studying
          </Button>
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
