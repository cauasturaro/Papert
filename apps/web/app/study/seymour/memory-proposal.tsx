"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { MemoryIcon } from "@/components/icons";
import type { MemoryItem } from "../../memory/memory-api";
import { MemoryEditor } from "../../memory/memory-editor";
import type { MemoryActions } from "../../memory/use-memory";

/** Seymour's suggestion under the answer that made it; nothing is remembered until the learner keeps it. */
export function MemoryProposal({
  item,
  actions,
}: {
  item: MemoryItem;
  actions: MemoryActions;
}) {
  const [editing, setEditing] = useState(false);
  const pending = actions.pendingId === item.id;

  async function keepEdited(kind: MemoryItem["kind"], text: string) {
    await actions.update({ id: item.id, kind, text });
    await actions.accept(item.id);

    setEditing(false);
  }

  return (
    <aside
      aria-label="Memory suggestion"
      className="space-y-2 rounded-md border border-ring/40 bg-card px-3 py-2"
    >
      <p className="flex items-center gap-2 text-xs font-medium">
        <MemoryIcon className="size-4 text-ring" />
        Remember this for future conversations?
      </p>

      {editing ? (
        <MemoryEditor
          label="Edit suggestion"
          saveLabel="Remember"
          initialKind={item.kind}
          initialText={item.text}
          pending={pending}
          onCancel={() => setEditing(false)}
          onSave={keepEdited}
        />
      ) : (
        <>
          <p className="text-sm">{item.text}</p>

          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => void actions.accept(item.id).catch(() => {})}
            >
              Remember
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => void actions.remove(item.id).catch(() => {})}
            >
              Not now
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}
