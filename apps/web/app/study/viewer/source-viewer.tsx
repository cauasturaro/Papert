"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge/badge";
import { buttonVariants } from "@/components/ui/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";
import { DownloadIcon } from "@/components/icons";
import { StudyRequestError } from "../study-api";
import { targetOf, type Citation } from "./citations";
import { PdfDocument } from "./pdf-document";
import type { Opening } from "./source-viewer-context";
import { MarkdownDocument, ParagraphDocument } from "./text-document";
import { fetchSourceView, type SourceView } from "./viewer-api";

// Links last five minutes; refresh before they expire while the viewer stays open.
const VIEW_STALE_MS = 4 * 60 * 1000;

const FORMAT_LABELS: Record<SourceView["source"]["format"], string> = {
  pdf: "PDF",
  doc: "DOC",
  docx: "DOCX",
  md: "Markdown",
};

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
    queryKey: ["source-view", workspaceId, sourceId],
    queryFn: () => fetchSourceView(workspaceId, sourceId),
    enabled: !!opening,
    staleTime: VIEW_STALE_MS,
    refetchInterval: VIEW_STALE_MS,
    retry: false,
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

function ViewerDetails({ view }: { view: SourceView }) {
  const pages = view.source.pageCount;

  return (
    <DialogDescription className="flex flex-wrap items-center gap-2">
      <Badge size="sm" variant="secondary">
        {FORMAT_LABELS[view.source.format]}
      </Badge>

      {pages && <span>{pages === 1 ? "1 page" : `${pages} pages`}</span>}

      {view.renderer === "paragraphs" && (
        <span>Text view of the original file</span>
      )}

      <a
        href={view.download}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <DownloadIcon />
        Download original
      </a>
    </DialogDescription>
  );
}

function CitedPassage({ citation }: { citation: Citation }) {
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

function ViewerBody({
  view,
  citation,
}: {
  view: SourceView;
  citation?: Citation;
}) {
  // A citation of another source never positions this document.
  const cited = citation?.sourceId === view.source.id ? citation : undefined;
  const target = cited ? targetOf(cited.location) : null;
  const excerpt = cited?.quote ?? cited?.excerpt ?? "";
  const quote = cited?.quote ?? "";

  if (view.renderer === "pdf") {
    return (
      <PdfDocument
        key={view.versionId}
        view={view}
        target={target}
        excerpt={excerpt}
      />
    );
  }

  if (view.renderer === "markdown") {
    return <MarkdownDocument view={view} target={target} quote={quote} />;
  }

  return <ParagraphDocument view={view} target={target} quote={quote} />;
}

function openingError(error: Error) {
  if (error instanceof StudyRequestError && error.status === 404) {
    return "This source was deleted or is not available in this workspace.";
  }

  return error.message;
}
