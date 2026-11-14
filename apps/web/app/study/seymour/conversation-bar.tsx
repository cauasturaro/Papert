"use client";

import { useState } from "react";
import { HistoryIcon, MemoryIcon, PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button/button";
import type { Conversation } from "../../memory/memory-api";
import type { ConversationActions } from "./use-conversations";
import { ConversationHistory } from "./conversation-history";

function titleOf(conversation: Conversation | null) {
  return conversation?.title ?? "New conversation";
}

/** Which conversation the transcript shows, how to switch or start one, and what Seymour keeps. */
export function ConversationBar({
  conversations,
  onOpenMemory,
}: {
  conversations: ConversationActions;
  onOpenMemory: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const { current, list } = conversations;

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5">
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        <span className="sr-only">Current conversation: </span>
        {titleOf(current)}
      </p>

      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label="New conversation"
        title="New conversation"
        disabled={conversations.starting}
        onClick={conversations.start}
      >
        <PlusIcon />
      </Button>

      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label="Conversation history"
        title="Conversation history"
        disabled={list.length === 0}
        onClick={() => setHistoryOpen(true)}
      >
        <HistoryIcon />
      </Button>

      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label="What Seymour remembers"
        title="What Seymour remembers"
        onClick={onOpenMemory}
      >
        <MemoryIcon />
      </Button>

      <ConversationHistory
        open={historyOpen}
        conversations={conversations}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
