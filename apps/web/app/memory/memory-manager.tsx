"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { LoadErrorAlert } from "@/components/app/load-error-alert";
import { AlertDialog } from "@/components/ui/alert-dialog/alert-dialog";
import { MemorySection } from "./memory-section";
import type { MemoryItem } from "./memory-api";
import { MemoryEditor } from "./memory-editor";
import { groupMemory, MAX_ACTIVE } from "./memory-state";
import { useMemory } from "./use-memory";

/** Review, add, edit and delete durable memories; shared by the memory page and the tutor dialog. */
export function MemoryManager() {
  const actions = useMemory();
  const manager = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<MemoryItem | null>(null);
  const { items } = actions;

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    const rows = Array.from(
      manager.current?.querySelectorAll<HTMLElement>("[data-memory-id]") ?? [],
    );
    const index = rows.findIndex(
      (row) => row.dataset.memoryId === pendingDelete.id,
    );
    const nextRow = rows[index + 1] ?? rows[index - 1];
    const nextAction =
      nextRow?.querySelector<HTMLButtonElement>("[data-memory-edit]");

    try {
      await actions.remove(pendingDelete.id);

      flushSync(() => setPendingDelete(null));

      const target =
        nextAction?.isConnected && !nextAction.disabled
          ? nextAction
          : manager.current?.querySelector<HTMLElement>("#memory-add");
      target?.focus();
    } catch {
      // The dialog stays open with the hook's message.
    }
  }

  if (items.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading what Seymour remembers…
      </p>
    );
  }

  if (items.error) {
    return (
      <LoadErrorAlert
        error={items.error}
        title="Memory could not load"
        signedOutTitle="Sign in to manage memory"
        onRetry={() => void items.refetch()}
      />
    );
  }

  const groups = groupMemory(items.data);
  const full = groups.activeCount >= MAX_ACTIVE;
  const proposal = pendingDelete?.status === "proposed";

  return (
    <div ref={manager} className="space-y-6">
      {actions.error && (
        <p role="alert" className="text-sm text-destructive">
          {actions.error}
        </p>
      )}

      {groups.proposals.length > 0 && (
        <MemorySection
          title="Suggestions to review"
          description="Seymour noticed these in your conversations. They are not used until you keep them."
          items={groups.proposals}
          actions={actions}
          onDelete={setPendingDelete}
        />
      )}

      <section aria-labelledby="memory-add" className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h2 tabIndex={-1} id="memory-add" className="text-sm font-semibold">
            Add a memory
          </h2>
          <p className="ml-auto text-xs text-muted-foreground" role="status">
            {groups.activeCount} of {MAX_ACTIVE} in use
          </p>
        </div>

        {full ? (
          <p className="text-sm text-muted-foreground">
            Seymour keeps at most {MAX_ACTIVE} memories. Delete one to add
            another.
          </p>
        ) : (
          <MemoryEditor
            label="New memory"
            saveLabel="Add"
            pending={actions.creating}
            onSave={(kind, text) => actions.create(kind, text)}
          />
        )}
      </section>

      <MemorySection
        title="Preferences"
        description="How you like to learn, such as the language of examples or the length of answers."
        empty="No preferences yet."
        items={groups.preferences}
        actions={actions}
        onDelete={setPendingDelete}
      />

      <MemorySection
        title="Difficulties"
        description="Topics you find hard, so Seymour can explain them more carefully."
        empty="No difficulties yet."
        items={groups.difficulties}
        actions={actions}
        onDelete={setPendingDelete}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        title={proposal ? "Dismiss this suggestion?" : "Delete this memory?"}
        description={
          proposal
            ? "Seymour will not suggest it again unless it comes up in a new conversation."
            : "Seymour stops using it in new answers right away. Conversations where it came up keep their own messages."
        }
        confirmLabel={proposal ? "Dismiss" : "Delete"}
        pending={actions.pendingId === pendingDelete?.id}
        error={pendingDelete ? (actions.error ?? undefined) : undefined}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
