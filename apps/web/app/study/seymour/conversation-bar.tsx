"use client";

import { Button } from "@/components/ui/button/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu/dropdown-menu";
import { HistoryIcon, MemoryIcon, PlusIcon } from "@/components/icons";
import type { Conversation } from "../../memory/memory-api";
import type { useConversations } from "./use-conversations";

const DATE = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function titleOf(conversation: Conversation | null) {
  return conversation?.title ?? "New conversation";
}

/** Which conversation the transcript shows, how to switch or start one, and what Seymour keeps. */
export function ConversationBar({
  conversations,
  disabled,
  onOpenMemory,
}: {
  conversations: ReturnType<typeof useConversations>;
  disabled: boolean;
  onOpenMemory: () => void;
}) {
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
        disabled={disabled || conversations.starting}
        onClick={conversations.start}
      >
        <PlusIcon />
      </Button>

      <DropdownMenu size="sm">
        <DropdownMenuTrigger
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Conversation history"
          title="Conversation history"
          disabled={disabled || list.length === 0}
        >
          <HistoryIcon />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Conversations in this workspace</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {list.map((conversation) => {
            const active = conversation.id === current?.id;

            return (
              <DropdownMenuItem
                key={conversation.id}
                aria-current={active ? "true" : undefined}
                onSelect={() => conversations.select(conversation.id)}
              >
                <span className="flex min-w-0 flex-col">
                  <span
                    className={active ? "truncate font-medium" : "truncate"}
                  >
                    {titleOf(conversation)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {DATE.format(new Date(conversation.lastActiveAt))}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

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
    </div>
  );
}
