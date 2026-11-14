"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { citedBlocks, type Target } from "./citations";

type NumberedBlock = {
  number: number;
  text: string;
  heading: boolean;
};

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

export function NumberedDocument({
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
