"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { PencilIcon, TrashIcon } from "@/components/icons";
import type { MemoryItem } from "./memory-api";
import { MemoryEditor } from "./memory-editor";
import type { MemoryActions } from "./use-memory";

const DATE = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/** One durable memory or suggestion with its review, edit and delete actions. */
export function MemoryItemRow({
  item,
  actions,
  onDelete,
}: {
  item: MemoryItem;
  actions: MemoryActions;
  onDelete: (item: MemoryItem) => void;
}) {
  const returnFocus = useRef(false);
  const [editing, setEditing] = useState(false);
  const proposal = item.status === "proposed";
  const pending = actions.pendingId === item.id;

  if (editing) {
    return (
      <li className="rounded-lg border border-border bg-card p-3">
        <MemoryEditor
          autoFocus
          label="Edit memory"
          saveLabel="Save"
          initialKind={item.kind}
          initialText={item.text}
          pending={pending}
          onCancel={() => {
            returnFocus.current = true;
            setEditing(false);
          }}
          onSave={async (kind, text) => {
            await actions.update({ id: item.id, kind, text });

            returnFocus.current = true;
            setEditing(false);
          }}
        />
      </li>
    );
  }

  let origin = "Added by you";
  if (item.origin === "seymour") {
    origin = proposal
      ? "Suggested by Seymour"
      : "Suggested by Seymour, kept by you";
  }

  return (
    <li
      data-memory-id={item.id}
      className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-card p-3"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm break-words">{item.text}</p>

        <p className="text-xs text-muted-foreground">
          {origin}
          {proposal && item.expiresAt && (
            <>
              {" "}
              · Expires {DATE.format(new Date(item.expiresAt))} unless you keep
              it
            </>
          )}
        </p>
      </div>

      {proposal && (
        <Badge size="sm" variant="outline">
          Not used yet
        </Badge>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {proposal && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => void actions.accept(item.id).catch(() => {})}
          >
            Remember
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          iconOnly
          ref={(button) => {
            if (button && !button.disabled && returnFocus.current) {
              returnFocus.current = false;

              button.focus();
            }
          }}
          data-memory-edit
          aria-label={`Edit “${item.text}”`}
          disabled={pending}
          onClick={() => setEditing(true)}
        >
          <PencilIcon />
        </Button>

        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label={
            proposal ? `Dismiss “${item.text}”` : `Delete “${item.text}”`
          }
          disabled={pending}
          onClick={() => onDelete(item)}
        >
          <TrashIcon />
        </Button>
      </div>
    </li>
  );
}
