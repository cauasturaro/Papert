"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import type { Target } from "./citations";
import { PdfPage } from "./pdf-page";
import "./pdf-text-layer.css";
import { usePdfDocument } from "./use-pdf-document";
import type { SourceView } from "./viewer-api";

type PdfDocumentProps = {
  view: SourceView;
  target: Target | null;
  excerpt: string;
};

/** Renders one page at a time from the original PDF, opening on the cited page. */
export function PdfDocument({ view, target, excerpt }: PdfDocumentProps) {
  const citedPage = target?.kind === "page" ? target.page : 1;

  // Mounted per version (see the key in SourceViewer): refreshed links do not reload it.
  const [url] = useState(view.original);
  const { pdf, error } = usePdfDocument(url);

  // Opening another citation of this document jumps to its page.
  const [navigation, setNavigation] = useState({
    cited: citedPage,
    page: citedPage,
  });
  const page = navigation.cited === citedPage ? navigation.page : citedPage;

  function setPage(next: number) {
    setNavigation({ cited: citedPage, page: next });
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!pdf) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading the PDF…
      </p>
    );
  }

  const pageCount = pdf.numPages;
  const current = Math.min(Math.max(page, 1), pageCount);
  const onCitedPage = target?.kind === "page" && current === citedPage;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <nav
        aria-label="PDF pages"
        className="flex shrink-0 flex-wrap items-center gap-2"
      >
        <Button
          size="sm"
          variant="outline"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </Button>

        <p role="status" className="text-sm">
          Page {current} of {pageCount}
        </p>

        <Button
          size="sm"
          variant="outline"
          disabled={current >= pageCount}
          onClick={() => setPage(current + 1)}
        >
          Next
        </Button>

        {target?.kind === "page" && !onCitedPage && (
          <Button size="sm" variant="ghost" onClick={() => setPage(citedPage)}>
            Back to cited page {citedPage}
          </Button>
        )}
      </nav>

      <PdfPage
        pdf={pdf}
        page={current}
        highlight={onCitedPage ? excerpt : ""}
      />
    </div>
  );
}
