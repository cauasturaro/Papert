"use client";

import { useQuery } from "@tanstack/react-query";
import { studyKeys } from "../study-keys";
import { type Target } from "./citations";
import { NumberedDocument } from "./numbered-document";
import { fetchMarkdownLines, type SourceView } from "./viewer-api";

type DocumentProps = {
  view: SourceView;
  target: Target | null;
  quote: string;
};

export function MarkdownDocument({ view, target, quote }: DocumentProps) {
  const lines = useQuery({
    queryKey: studyKeys.sourceContent(view.source.id, view.versionId),
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
