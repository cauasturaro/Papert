"use client";

import { CloseIcon, FileIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export function EditorTab({
  path,
  name,
  folder,
  position,
  active,
  unsaved,
  onSelect,
  onClose,
}: {
  path: string;
  name: string;
  folder: string | null;
  position: number;
  active: boolean;
  unsaved: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <li
      className={cn(
        "group flex shrink-0 items-center border-r border-border text-sm",
        active
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      <button
        type="button"
        title={position <= 9 ? `${path} (tab ${position})` : path}
        aria-current={active ? "true" : undefined}
        className="flex h-full items-center gap-2 pr-1 pl-3 font-mono text-xs focus-visible:outline-offset-[-2px]"
        onClick={onSelect}
      >
        <FileIcon className="size-3.5" />
        {name}

        {folder && <span className="text-muted-foreground">· {folder}</span>}

        {unsaved && (
          <>
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-ring"
            />
            <span className="sr-only">, unsaved</span>
          </>
        )}
      </button>

      <button
        type="button"
        aria-label={`Close ${path}`}
        className="mr-1 flex size-6 items-center justify-center rounded-sm opacity-60 hover:bg-accent hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-offset-[-2px]"
        onClick={onClose}
      >
        <CloseIcon className="size-3.5" />
      </button>
    </li>
  );
}
