"use client";

import { Button } from "@/components/ui/button/button";
import { BookIcon } from "@/components/icons";
import { preview, type Citation, type Grounding } from "../viewer/citations";
import { useOpenSource } from "../viewer/source-viewer-context";

/** The passages an answer used, each opening the original at its location. */
export function AnswerSources({ grounding }: { grounding: Grounding }) {
  if (grounding.support === "unsupported") {
    return (
      <p className="border-t border-border pt-2 text-xs text-muted-foreground">
        No passage from your sources supports this answer. Treat it as general
        guidance and check it against your documents.
      </p>
    );
  }

  return (
    <ul
      aria-label="Sources used"
      className="space-y-2 border-t border-border pt-2"
    >
      {grounding.citations.map((citation, index) => (
        <li key={`${citation.sourceId}-${citation.cite}-${index}`}>
          <CitedExcerpt citation={citation} />
        </li>
      ))}
    </ul>
  );
}

function CitedExcerpt({ citation }: { citation: Citation }) {
  const openSource = useOpenSource();

  // A quote is the exact part the answer refers to; otherwise preview the passage.
  const shown = citation.quote ?? preview(citation.excerpt);

  return (
    <figure className="space-y-1">
      <blockquote className="max-h-60 overflow-auto rounded-md border border-border bg-card px-2 py-1.5">
        <pre className="font-mono text-xs whitespace-pre-wrap">{shown}</pre>
      </blockquote>

      <figcaption>
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0 text-xs"
          onClick={() => openSource({ sourceId: citation.sourceId, citation })}
        >
          <BookIcon />
          {citation.cite}
          <span className="sr-only"> (open the original)</span>
        </Button>
      </figcaption>
    </figure>
  );
}
