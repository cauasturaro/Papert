"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";
import { CitedPassage } from "./cited-passage";
import { ViewerBody } from "./viewer-body";
import { ViewerDetails } from "./viewer-details";
import { StudyRequestError } from "../study-api";
import { studyKeys } from "../study-keys";
import type { Opening } from "./source-viewer-context";
import { fetchSourceView } from "./viewer-api";

// Links last five minutes; refresh before they expire while the viewer stays open.
const VIEW_STALE_MS = 4 * 60 * 1000;

type SourceViewerProps = {
  workspaceId: string;
  opening: Opening | null;
  onClose: () => void;
};

export function SourceViewer({
  workspaceId,
  opening,
  onClose,
}: SourceViewerProps) {
  const sourceId = opening?.sourceId ?? "";

  const view = useQuery({
    queryKey: studyKeys.sourceView(workspaceId, sourceId),
    queryFn: () => fetchSourceView(workspaceId, sourceId),
    enabled: !!opening,
    staleTime: VIEW_STALE_MS,
    refetchInterval: VIEW_STALE_MS,
  });

  const data = view.data;
  const title = data?.source.filename ?? opening?.citation?.cite ?? "Source";

  return (
    <Dialog
      open={!!opening}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      closeLabel="Close source viewer"
      aria-labelledby="source-viewer-title"
      className="h-[calc(100dvh-2rem)] max-w-6xl [--dialog-padding:1rem] sm:[--dialog-padding:1.25rem]"
    >
      <DialogHeader className="border-b border-border">
        <DialogTitle id="source-viewer-title" className="text-base">
          {title}
        </DialogTitle>

        {data && <ViewerDetails view={data} />}
      </DialogHeader>

      <DialogContent className="flex flex-col gap-4 pt-4 lg:flex-row lg:space-y-0">
        {opening?.citation && <CitedPassage citation={opening.citation} />}

        <div className="min-h-0 min-w-0 flex-1">
          {view.isPending && opening && (
            <p role="status" className="text-muted-foreground">
              Opening the original…
            </p>
          )}

          {view.error && <p role="alert">{openingError(view.error)}</p>}

          {data && <ViewerBody view={data} citation={opening?.citation} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function openingError(error: Error) {
  if (error instanceof StudyRequestError && error.status === 404) {
    return "This source was deleted or is not available in this workspace.";
  }

  return error.message;
}
