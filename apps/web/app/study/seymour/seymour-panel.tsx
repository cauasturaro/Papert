"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button/button";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import { SparklesIcon } from "@/components/icons";
import { CollapsePanelButton } from "../side-panel-controls";
import { SeymourComposer } from "./seymour-composer";
import { MEMORY_KEY } from "../../memory/memory-keys";
import { useMemory } from "../../memory/use-memory";
import { useSeymour, type CodeSelection } from "./use-seymour";
import { useReadySources } from "../sources/use-ready-sources";
import { ChatTurn } from "./chat-turn";
import { ConversationBar } from "./conversation-bar";
import { ConversationSummary } from "./conversation-summary";
import { MemoryDialog } from "./memory-dialog";
import { useConversations } from "./use-conversations";

type SeymourPanelProps = {
  workspaceId: string;
  revision: number;
  activeFile?: string;
  selection?: CodeSelection;
  onCollapse: () => void;
};

export function SeymourPanel({ onCollapse, ...props }: SeymourPanelProps) {
  const sources = useReadySources(props.workspaceId);
  const conversations = useConversations(props.workspaceId);
  const memory = useMemory();
  const queryClient = useQueryClient();
  const [memoryOpen, setMemoryOpen] = useState(false);

  const seymour = useSeymour({
    ...props,
    sources,
    conversationId: conversations.currentId,
    onCreated: (execution) =>
      conversations.adopt(execution.conversationId ?? null),
  });
  const hasConversation = seymour.history.length > 0 || !!seymour.execution;

  // A completed answer may have added a suggestion or a new conversation summary.
  const completedId =
    seymour.execution?.status === "completed" ? seymour.execution.id : null;

  useEffect(() => {
    if (completedId) {
      void queryClient.invalidateQueries({ queryKey: [MEMORY_KEY] });
    }
  }, [completedId, queryClient]);

  return (
    <section
      aria-label="Seymour execution"
      className="flex h-full min-h-0 flex-col bg-card"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <SparklesIcon className="size-4 text-ring" />
        <h2 className="text-sm font-semibold">Seymour</h2>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-xs"
          disabled={seymour.busy || seymour.running}
          onClick={seymour.refresh}
        >
          Refresh
        </Button>
        <CollapsePanelButton
          side="right"
          label="Seymour panel"
          onCollapse={onCollapse}
        />
      </header>

      <ConversationBar
        conversations={conversations}
        disabled={seymour.busy || seymour.running}
        onOpenMemory={() => setMemoryOpen(true)}
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3 text-sm">
        <ConversationSummary conversation={conversations.current} />

        {!hasConversation && (
          <EmptyState size="sm" className="py-8">
            <EmptyStateIcon>
              <SparklesIcon />
            </EmptyStateIcon>
            <EmptyStateTitle>Ask Seymour</EmptyStateTitle>
            <EmptyStateDescription>
              Ask about your saved code or learn one step at a time. Seymour
              reads your saved context without executing your code. Step
              approval is separate. A new conversation starts without earlier
              messages but keeps what Seymour remembers about you.
            </EmptyStateDescription>
          </EmptyState>
        )}

        {seymour.history.map((job) => (
          <ChatTurn key={job.id} execution={job} live={false} memory={memory} />
        ))}

        {seymour.execution && (
          <ChatTurn execution={seymour.execution} live memory={memory} />
        )}

        <p role="status" className="text-muted-foreground">
          {seymour.message || conversations.error?.message}
        </p>
      </div>

      <SeymourComposer
        seymour={seymour}
        revision={props.revision}
        activeFile={props.activeFile}
        selection={props.selection}
        sources={sources}
      />

      <MemoryDialog open={memoryOpen} onOpenChange={setMemoryOpen} />
    </section>
  );
}
