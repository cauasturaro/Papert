"use client";

import { useQuery } from "@tanstack/react-query";
import { studyKeys } from "../study-keys";
import { type Target } from "./citations";
import { NumberedDocument } from "./numbered-document";
import { fetchRenditionBlocks, type SourceView } from "./viewer-api";

type DocumentProps = {
  view: SourceView;
  target: Target | null;
  quote: string;
};

export function ParagraphDocument({ view, target, quote }: DocumentProps) {
  const rendition = useQuery({
    queryKey: studyKeys.sourceContent(view.source.id, view.versionId),
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
