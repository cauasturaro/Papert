"use client";

import { BookIcon, FileIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { MentionTarget } from "./mentions";
import { mentionOptionId } from "./use-mention-picker";

/** Listbox of workspace sources and saved files shown while the learner types an @ mention. */
export function MentionMenu({
  options,
  highlighted,
  hasTargets,
  onChoose,
}: {
  options: MentionTarget[];
  highlighted: number;
  hasTargets: boolean;
  onChoose: (target: MentionTarget) => void;
}) {
  let empty = "No source or file matches.";

  if (!hasTargets) {
    empty =
      "No ready sources or saved files yet. Add documents in the Sources tab.";
  }

  return (
    <ul
      id="source-mentions"
      role="listbox"
      aria-label="Sources and files"
      className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-48 overflow-auto rounded-md border border-border bg-popover p-1 text-sm shadow-md"
    >
      {options.length === 0 && (
        <li className="px-2 py-1.5 text-xs text-muted-foreground">{empty}</li>
      )}

      {options.map((target, index) => {
        const isFile = target.kind === "file";

        return (
          <li
            key={target.id}
            id={mentionOptionId(index)}
            role="option"
            aria-selected={index === highlighted}
            // Keep focus in the textarea so the caret position survives the click.
            onMouseDown={(event) => {
              event.preventDefault();
              onChoose(target);
            }}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 [&>svg]:size-3.5 [&>svg]:shrink-0",
              index === highlighted && "bg-accent text-accent-foreground",
            )}
          >
            {isFile ? <FileIcon /> : <BookIcon />}
            <span className={cn("truncate", isFile && "font-mono text-xs")}>
              {target.filename}
            </span>
            <span className="sr-only">
              {isFile ? " (code file)" : " (source)"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
