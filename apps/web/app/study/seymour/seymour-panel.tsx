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
import { useSeymour, type CodeSelection } from "./use-seymour";

type SeymourPanelProps = {
  workspaceId: string;
  revision: number;
  activeFile?: string;
  selection?: CodeSelection;
  onCollapse: () => void;
};

export function SeymourPanel({ onCollapse, ...props }: SeymourPanelProps) {
  const seymour = useSeymour(props);
  const hasConversation = !!seymour.sentPrompt || !!seymour.execution;

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

        {seymour.sentPrompt && (
          <p className="ml-8 rounded-lg rounded-br-sm bg-primary px-3 py-2 whitespace-pre-wrap text-primary-foreground">
            {seymour.sentPrompt}
          </p>
        )}

        {seymour.execution && (
          <div className="mr-4 space-y-2 rounded-lg rounded-bl-sm border border-border bg-muted px-3 py-2">
            <p role="status" className="flex items-center gap-2 text-xs">
              <span className="sr-only">Execution:</span>
              <Badge size="sm" variant="secondary">
                {seymour.execution.status}
              </Badge>
            </p>
            <p className="whitespace-pre-wrap" aria-live="polite">
              {seymour.execution.text}
            </p>
          </div>
        )}

        <p role="status" className="text-muted-foreground">
          {seymour.message}
        </p>
      </div>

      <SeymourComposer
        seymour={seymour}
        revision={props.revision}
        activeFile={props.activeFile}
        selection={props.selection}
      />
    </section>
  );
}
