"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertDialog } from "@/components/ui/alert-dialog/alert-dialog";
import { Button } from "@/components/ui/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";
import { Input } from "@/components/ui/input/input";
import { announce } from "@/lib/a11y/announcer";
import { toLearnerMessage } from "@/lib/api/learner-error";
import type { Conversation } from "../../memory/memory-api";
import type { ConversationActions } from "./use-conversations";
import { ConversationRow } from "./conversation-row";

function titleOf(conversation: Conversation | null) {
  return conversation?.title ?? "New conversation";
}

export function ConversationHistory({
  open,
  conversations,
  onOpenChange,
}: {
  open: boolean;
  conversations: ConversationActions;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Rows shown when "Show more" was pressed; the first new row takes focus.
  const shownBefore = useRef<Set<string> | null>(null);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      conversations.list.filter((conversation) =>
        titleOf(conversation).toLowerCase().includes(needle),
      ),
    [conversations.list, needle],
  );
  const { loadingMore, loadMoreError } = conversations;

  useEffect(() => {
    const before = shownBefore.current;
    if (!before || loadingMore) {
      return;
    }

    shownBefore.current = null;

    // The error message speaks for a failed page; focus stays on Show more to retry.
    if (loadMoreError) {
      return;
    }

    const added = shown.filter((conversation) => !before.has(conversation.id));
    if (added.length === 0) {
      announce(
        needle
          ? "No more conversations match."
          : "All conversations are shown.",
      );

      // The Show more button may have gone with its focus.
      if (document.activeElement === document.body) {
        searchRef.current?.focus();
      }

      return;
    }

    announce(
      `${added.length} more ${added.length === 1 ? "conversation" : "conversations"} shown.`,
    );
    listRef.current
      ?.querySelector<HTMLElement>(
        `[data-conversation-id="${added[0].id}"] button`,
      )
      ?.focus();
  }, [shown, needle, loadingMore, loadMoreError]);

  function showMore() {
    shownBefore.current = new Set(shown.map((conversation) => conversation.id));
    conversations.loadMore();
  }

  async function confirmDelete() {
    if (!deleting) {
      return;
    }

    setDeleteError(null);

    try {
      await conversations.remove(deleting.id);
    } catch (failure) {
      setDeleteError(toLearnerMessage(failure));

      return;
    }

    setDeleting(null);
  }

  return (
    <Dialog size="md" open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Conversations in this workspace</DialogTitle>
        <DialogDescription>
          Open an earlier conversation, rename it or delete it. What Seymour
          remembers about you is kept either way.
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="space-y-3">
        <Input
          ref={searchRef}
          type="search"
          aria-label="Search conversations"
          placeholder="Search conversations"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {shown.length === 0 && !conversations.hasMore && (
          <p className="text-sm text-muted-foreground">
            No conversation matches.
          </p>
        )}

        <ul
          ref={listRef}
          aria-busy={loadingMore}
          className="max-h-[50dvh] space-y-1 overflow-auto"
        >
          {shown.map((conversation) => (
            <li key={conversation.id} data-conversation-id={conversation.id}>
              <ConversationRow
                conversation={conversation}
                active={conversation.id === conversations.current?.id}
                conversations={conversations}
                onOpen={() => {
                  conversations.select(conversation.id);
                  onOpenChange(false);
                }}
                onDelete={() => {
                  setDeleteError(null);
                  setDeleting(conversation);
                }}
              />
            </li>
          ))}
        </ul>

        {loadMoreError && (
          <p role="alert" className="text-xs text-destructive">
            Older conversations could not load.{" "}
            {toLearnerMessage(loadMoreError)}
          </p>
        )}

        {conversations.hasMore && (
          <Button
            size="sm"
            variant="outline"
            loading={loadingMore}
            onClick={showMore}
          >
            Show older conversations
          </Button>
        )}
      </DialogContent>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDeleting(null);
          }
        }}
        title="Delete this conversation?"
        description="Its messages are deleted for good. What Seymour remembers about you and your step progress are not affected."
        confirmLabel="Delete"
        pending={conversations.removing}
        error={deleteError ?? undefined}
        onConfirm={() => void confirmDelete()}
      />
    </Dialog>
  );
}
