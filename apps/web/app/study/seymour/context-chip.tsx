"use client";

import { type ReactNode } from "react";
import { Button } from "@/components/ui/button/button";
import { CloseIcon } from "@/components/icons";

export function ContextChip({
  icon,
  label,
  note,
  onRemove,
}: {
  icon: ReactNode;
  label: string;
  note?: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <span className="truncate">{label}</span>

      {note && <span className="shrink-0 font-sans">· {note}</span>}

      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Don't send ${label}`}
          title="Don't send this selection"
          className="-mr-0.5 shrink-0 [&>svg]:size-3"
          onClick={onRemove}
        >
          <CloseIcon />
        </Button>
      )}
    </span>
  );
}
