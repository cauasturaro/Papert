"use client";

import { BookIcon } from "@/components/icons";
import { Button } from "@/components/ui/button/button";
import { useOpenSource } from "../viewer/source-viewer-context";
import type { Evidence } from "./drafts-api";

export function EvidenceLinks({ items }: { items: Evidence[] }) {
  const openSource = useOpenSource();

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Based on</span>

      {items.map((item) => {
        // The viewer opens at the cited location; evidence carries no passage text.
        const citation = { ...item, excerpt: "", quote: null };

        return (
          <Button
            key={`${item.sourceId}-${item.cite}`}
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => openSource({ sourceId: item.sourceId, citation })}
          >
            <BookIcon className="size-3.5" />
            {item.cite}
          </Button>
        );
      })}
    </div>
  );
}
