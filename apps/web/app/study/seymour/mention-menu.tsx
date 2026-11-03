"use client";

import { BookIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { MentionTarget } from "./mentions";

/** Listbox of workspace sources shown while the learner types an @ mention. */
export function MentionMenu({
  options,
  highlighted,
  hasSources,
  onChoose,
}: {
  options: MentionTarget[];
  highlighted: number;
  hasSources: boolean;
  onChoose: (source: MentionTarget) => void;
}) {
  let empty = "No source matches.";

  if (!hasSources) {
    empty = "No ready sources yet. Add documents in the Sources tab.";
  }

  return (
    <ul
      id="source-mentions"
      role="listbox"
      aria-label="Workspace sources"
      className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-48 overflow-auto rounded-md border border-border bg-popover p-1 text-sm shadow-md"
    >
      {options.length === 0 && (
        <li className="px-2 py-1.5 text-xs text-muted-foreground">{empty}</li>
      )}

      {options.map((source, index) => (
        <li
          key={source.id}
          id={`source-mention-${source.id}`}
          role="option"
          aria-selected={index === highlighted}
          // Keep focus in the textarea so the caret position survives the click.
          onMouseDown={(event) => {
            event.preventDefault();
            onChoose(source);
          }}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 [&>svg]:size-3.5 [&>svg]:shrink-0",
            index === highlighted && "bg-accent text-accent-foreground",
          )}
        >
          <BookIcon />
          <span className="truncate">{source.filename}</span>
        </li>
      ))}
    </ul>
  );
}
