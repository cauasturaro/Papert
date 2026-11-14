"use client";

import { useState } from "react";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/input/input";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { formatRelativeTime } from "@/lib/format/time";
import { cn } from "@/lib/utils";
import type { Conversation } from "../../memory/memory-api";
import type { ConversationActions } from "./use-conversations";

function titleOf(conversation: Conversation | null) {
  return conversation?.title ?? "New conversation";
}

export function ConversationRow({
  conversation,
  active,
  conversations,
  onOpen,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  conversations: ConversationActions;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(titleOf(conversation));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);

    try {
      await conversations.rename(conversation.id, title);
    } catch (failure) {
      setError(toLearnerMessage(failure));

      return;
    }

    setEditing(false);
  }

  if (editing) {
    return (
      <form
        className="space-y-1 rounded-md border border-border p-2"
        onSubmit={(event) => {
          event.preventDefault();

          void save();
        }}
      >
        <Input
          size="sm"
          aria-label="Conversation name"
          maxLength={80}
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={conversations.renaming}>
            Save
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-md hover:bg-accent">
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring"
        onClick={onOpen}
      >
        <span className={cn("w-full truncate", active && "font-semibold")}>
          {titleOf(conversation)}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(conversation.lastActiveAt)}
        </span>
      </button>

      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label={`Rename ${titleOf(conversation)}`}
        title="Rename"
        onClick={() => {
          setTitle(titleOf(conversation));
          setEditing(true);
        }}
      >
        <PencilIcon />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label={`Delete ${titleOf(conversation)}`}
        title="Delete"
        onClick={onDelete}
      >
        <TrashIcon />
      </Button>
    </div>
  );
}
