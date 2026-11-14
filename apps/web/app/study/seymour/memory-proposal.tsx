"use client";

import { useState } from "react";
import { MemoryIcon } from "@/components/icons";
import { AlertDialog } from "@/components/ui/alert-dialog/alert-dialog";
import { Button } from "@/components/ui/button/button";
import { toLearnerMessage } from "@/lib/api/learner-error";
import type { MemoryItem } from "../../memory/memory-api";
import { MemoryEditor } from "../../memory/memory-editor";
import type { MemoryActions } from "../../memory/use-memory";

export type ProposalActions = Pick<MemoryActions, "pendingId" | "accept" | "update" | "remove">;

/** Seymour's suggestion under the answer that made it; nothing is remembered until the learner keeps it. */
export function MemoryProposal({
  item,
  actions,
}: {
  item: MemoryItem;
  actions: ProposalActions;
}) {
  const [editing, setEditing] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = actions.pendingId === item.id;

  async function run(action: () => Promise<unknown>) {
    setError(null);

    try {
      await action();

      return true;
    } catch (failure) {
      setError(toLearnerMessage(failure));

      return false;
    }
  }

  async function keepEdited(kind: MemoryItem["kind"], text: string) {
    const kept = await run(async () => {
      await actions.update({ id: item.id, kind, text });
      await actions.accept(item.id);
    });

    if (kept) {
      setEditing(false);
    }
  }

  async function dismiss() {
    const removed = await run(() => actions.remove(item.id));

    if (removed) {
      setDismissing(false);
    }
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
              onClick={() => void run(() => actions.accept(item.id))}
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
              onClick={() => setDismissing(true)}
            >
              Dismiss
            </Button>
          </div>
        </>
      )}

      {error && !dismissing && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <AlertDialog
        open={dismissing}
        onOpenChange={(open) => {
          setDismissing(open);
          setError(null);
        }}
        title="Dismiss this suggestion?"
        description="Seymour deletes the suggestion and will not use it. You can still add a memory yourself later."
        confirmLabel="Dismiss"
        pending={pending}
        error={dismissing ? (error ?? undefined) : undefined}
        onConfirm={() => void dismiss()}
      />
    </aside>
  );
}
