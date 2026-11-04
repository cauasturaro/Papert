"use client";

import { useRef, useState, type DragEvent } from "react";
import { AlertDialog } from "@/components/ui/alert-dialog/alert-dialog";
import { Button } from "@/components/ui/button/button";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import { BookIcon, UploadIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { Source } from "./sources-api";
import { ACCEPTED_EXTENSIONS, MAX_WORKSPACE_SOURCES } from "./source-rules";
import { SourceRow, UploadRow } from "./source-rows";
import { useSources } from "./use-sources";
import { useOpenSource } from "../viewer/source-viewer-context";

type SourcesPanelProps = {
  workspaceId: string;
};

export function SourcesPanel({ workspaceId }: SourcesPanelProps) {
  const sources = useSources(workspaceId);
  const openSource = useOpenSource();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Source | null>(null);

  const full = sources.sources.length >= MAX_WORKSPACE_SOURCES;
  const unregistered = sources.uploads.filter((upload) => !upload.sourceId);

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);

    if (!full && event.dataTransfer.files.length > 0) {
      void sources.upload(event.dataTransfer.files);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    try {
      await sources.remove(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      // The dialog stays open and shows the error from the mutation.
    }
  }

  return (
    <section
      aria-label="Sources"
      className={cn(
        "flex h-full min-h-0 flex-col bg-card",
        dragging && "outline-2 -outline-offset-2 outline-ring outline-dashed",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <p className="flex-1 truncate text-xs text-muted-foreground">
          {sources.sources.length} of {MAX_WORKSPACE_SOURCES} sources
        </p>

        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = event.target.files;

            if (files && files.length > 0) {
              void sources.upload(files);
            }

            event.target.value = "";
          }}
        />

        <Button
          size="sm"
          variant="outline"
          disabled={full}
          onClick={() => input.current?.click()}
        >
          <UploadIcon />
          Add
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3 text-sm">
        {sources.loadError && (
          <p role="alert" className="text-destructive">
            {sources.loadError}
          </p>
        )}

        {unregistered.map((upload) => (
          <UploadRow
            key={upload.key}
            upload={upload}
            onDismiss={() => sources.dismiss(upload.key)}
          />
        ))}

        {!sources.loading &&
          sources.sources.length === 0 &&
          unregistered.length === 0 && (
            <EmptyState size="sm">
              <EmptyStateIcon>
                <BookIcon />
              </EmptyStateIcon>
              <EmptyStateTitle as="h3">No sources yet</EmptyStateTitle>
              <EmptyStateDescription>
                Add documentation, articles or notes that Seymour can cite for
                this workspace. Drop files here or use Add.
              </EmptyStateDescription>
            </EmptyState>
          )}

        <ul className="space-y-2" aria-label="Workspace sources">
          {sources.sources.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              upload={sources.uploads.find(
                (upload) => upload.sourceId === source.id,
              )}
              deleting={sources.removing === source.id}
              onOpen={() => openSource({ sourceId: source.id })}
              onDelete={() => {
                sources.resetRemoveError();
                setPendingDelete(source);
              }}
            />
          ))}
        </ul>
      </div>

      <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        PDF, DOC, DOCX, MD · 15 MB each
      </p>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        title="Delete this source?"
        description={
          <>
            <span className="font-medium">{pendingDelete?.filename}</span> and
            its indexed passages will be removed. Seymour will no longer cite
            it.
          </>
        }
        confirmLabel="Delete"
        pending={sources.removing !== null}
        error={sources.removeError ?? undefined}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
