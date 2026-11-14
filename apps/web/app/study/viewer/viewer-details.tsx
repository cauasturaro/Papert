"use client";

import { DownloadIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge/badge";
import { buttonVariants } from "@/components/ui/button/button";
import { DialogDescription } from "@/components/ui/dialog/dialog";
import { type SourceView } from "./viewer-api";

const FORMAT_LABELS: Record<SourceView["source"]["format"], string> = {
  pdf: "PDF",
  doc: "DOC",
  docx: "DOCX",
  md: "Markdown",
};

export function ViewerDetails({ view }: { view: SourceView }) {
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
