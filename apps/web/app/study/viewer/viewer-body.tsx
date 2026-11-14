"use client";

import { targetOf, type Citation } from "./citations";
import { PdfDocument } from "./pdf-document";
import { MarkdownDocument, ParagraphDocument } from "./text-document";
import { type SourceView } from "./viewer-api";

export function ViewerBody({
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
