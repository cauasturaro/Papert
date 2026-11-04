"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { citedBlocks, type Target } from "./citations";
import {
  fetchMarkdownLines,
  fetchRenditionBlocks,
  type SourceView,
} from "./viewer-api";

type DocumentProps = {
  view: SourceView;
  target: Target | null;
  quote: string;
};

type NumberedBlock = {
  number: number;
  text: string;
  heading: boolean;
};

/** The Markdown original, line by line, so `lines a-b` citations land exactly. */
export function MarkdownDocument({ view, target, quote }: DocumentProps) {
  const lines = useQuery({
    queryKey: ["source-content", view.source.id, view.versionId],
    queryFn: () => fetchMarkdownLines(view),
    staleTime: Infinity,
  });

  const blocks = (lines.data ?? []).map((text, index) => ({
    number: index + 1,
    text,
    heading: /^#{1,6}\s/.test(text),
  }));

  return (
    <NumberedDocument
      label="Markdown source"
      kind="lines"
      blocks={blocks}
      target={target}
      quote={quote}
      loading={lines.isPending}
      error={lines.error}
      code
    />
  );
}

/** DOC/DOCX text rendition with the paragraph numbers used by citations. */
export function ParagraphDocument({ view, target, quote }: DocumentProps) {
  const rendition = useQuery({
    queryKey: ["source-content", view.source.id, view.versionId],
    queryFn: () => fetchRenditionBlocks(view),
    staleTime: Infinity,
  });

  const blocks = (rendition.data ?? []).map((block) => ({
    number: block.location.paragraphStart,
    text: block.text,
    heading: block.text === block.location.heading,
  }));

  return (
    <NumberedDocument
      label="Document text"
      kind="paragraphs"
      blocks={blocks}
      target={target}
      quote={quote}
      loading={rendition.isPending}
      error={rendition.error}
    />
  );
}

type NumberedDocumentProps = {
  label: string;
  kind: "lines" | "paragraphs";
  blocks: NumberedBlock[];
  target: Target | null;
  quote: string;
  loading: boolean;
  error: Error | null;
  code?: boolean;
};

function NumberedDocument({
  label,
  kind,
  blocks,
  target,
  quote,
  loading,
  error,
  code = false,
}: NumberedDocumentProps) {
  const firstCitedRow = useRef<HTMLLIElement>(null);
  const ready = blocks.length > 0;

  // Bring the cited range into view once the text has loaded.
  useEffect(() => {
    if (ready) {
      firstCitedRow.current?.scrollIntoView({ block: "center" });
    }
  }, [ready, target]);

  if (loading) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading the document…
      </p>
    );
  }

  if (error) {
    return <p role="alert">{error.message}</p>;
  }

  const unit = kind === "lines" ? "Line" : "Paragraph";
  const cited = citedBlocks(target, kind, blocks, quote);
  const firstCited = blocks.find((block) => cited.has(block.number))?.number;

  return (
    <ol
      aria-label={label}
      className={cn(
        "rounded-md border border-border bg-card py-2",
        code ? "font-mono text-xs" : "text-sm leading-relaxed",
      )}
    >
      {blocks.map((block) => {
        const isCited = cited.has(block.number);
        const isFirst = block.number === firstCited;

        return (
          <li
            key={block.number}
            ref={isFirst ? firstCitedRow : undefined}
            data-cited={isCited || undefined}
            className={cn(
              "flex items-baseline gap-3 border-l-2 border-transparent px-3",
              kind === "paragraphs" && "py-1",
              isCited && "border-ring bg-primary/15",
            )}
          >
            <span
              aria-label={`${unit} ${block.number}`}
              className="w-10 shrink-0 text-right text-xs text-muted-foreground select-none"
            >
              {kind === "lines" ? block.number : `¶ ${block.number}`}
            </span>

            <span
              className={cn(
                "min-w-0 flex-1 whitespace-pre-wrap",
                block.heading && "font-semibold",
              )}
            >
              {block.text || " "}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
