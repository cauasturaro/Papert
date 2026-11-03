"use client";

import { Badge } from "@/components/ui/badge/badge";
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
import type { Execution } from "../execution-state";
import { useSeymour, type CodeSelection } from "./use-seymour";
import { useReadySources } from "../sources/use-ready-sources";

type SeymourPanelProps = {
  workspaceId: string;
  revision: number;
  activeFile?: string;
  selection?: CodeSelection;
  onCollapse: () => void;
};

export function SeymourPanel({ onCollapse, ...props }: SeymourPanelProps) {
  const sources = useReadySources(props.workspaceId);
  const seymour = useSeymour({ ...props, sources });
  const hasConversation = seymour.history.length > 0 || !!seymour.execution;

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

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3 text-sm">
        {!hasConversation && (
          <EmptyState size="sm" className="py-8">
            <EmptyStateIcon>
              <SparklesIcon />
            </EmptyStateIcon>
            <EmptyStateTitle>Ask Seymour</EmptyStateTitle>
            <EmptyStateDescription>
              Ask about your saved code or learn one step at a time. Seymour
              reads your saved context without executing your code. Step
              approval is separate.
            </EmptyStateDescription>
          </EmptyState>
        )}

        {seymour.history.map((job) => (
          <ChatTurn key={job.id} execution={job} live={false} />
        ))}

        {seymour.execution && <ChatTurn execution={seymour.execution} live />}

        <p role="status" className="text-muted-foreground">
          {seymour.message}
        </p>
      </div>

      <SeymourComposer
        seymour={seymour}
        revision={props.revision}
        activeFile={props.activeFile}
        selection={props.selection}
        sources={sources}
      />
    </section>
  );
}

// Only the followed job announces updates; past turns are static transcript.
function ChatTurn({
  execution,
  live,
}: {
  execution: Execution;
  live: boolean;
}) {
  return (
    <>
      {execution.prompt && (
        <p className="ml-8 rounded-lg rounded-br-sm bg-primary px-3 py-2 whitespace-pre-wrap text-primary-foreground">
          {execution.prompt}
        </p>
      )}

      <div className="mr-4 space-y-2 rounded-lg rounded-bl-sm border border-border bg-muted px-3 py-2">
        <p
          role={live ? "status" : undefined}
          className="flex items-center gap-2 text-xs"
        >
          <span className="sr-only">Execution:</span>
          <Badge size="sm" variant="secondary">
            {execution.status}
          </Badge>
        </p>
        <p
          className="whitespace-pre-wrap"
          aria-live={live ? "polite" : undefined}
        >
          {execution.text}
        </p>
      </div>
    </>
  );
}
