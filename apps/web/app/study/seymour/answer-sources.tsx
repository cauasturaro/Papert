"use client";

import { BookIcon } from "@/components/icons";
import { preview, type Citation, type Grounding } from "../viewer/citations";
import { useOpenSource } from "../viewer/source-viewer-context";

/** The passages an answer used as compact chips; each opens the original at its location. */
export function AnswerSources({ grounding }: { grounding: Grounding }) {
  if (grounding.support === "unsupported") {
    return (
      <p className="text-xs text-muted-foreground">
        No passage from your sources supports this answer. Treat it as general
        guidance and check it against your documents.
      </p>
    );
  }

  return (
    <ul aria-label="Sources used" className="flex flex-wrap gap-1">
      {grounding.citations.map((citation, index) => (
        <li key={`${citation.sourceId}-${citation.cite}-${index}`}>
          <CitationChip citation={citation} />
        </li>
      ))}
    </ul>
  );
}

function CitationChip({ citation }: { citation: Citation }) {
  const openSource = useOpenSource();

  // A quote is the exact part the answer refers to; otherwise preview the passage.
  const shown = citation.quote ?? preview(citation.excerpt);

  return (
    <button
      type="button"
      title={shown}
      className="inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring [&>svg]:size-3 [&>svg]:shrink-0"
      onClick={() => openSource({ sourceId: citation.sourceId, citation })}
    >
      <BookIcon />
      <span className="truncate">{citation.cite}</span>
      <span className="sr-only"> (open the cited passage)</span>
    </button>
  );
}
