"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion/accordion";
import { Button } from "@/components/ui/button/button";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { formatRelativeTime } from "@/lib/format/time";
import type { AttemptSummary } from "./attempts-api";
import { AttemptStatusBadge } from "../attempt/attempt-status";
import type { AskSeymour, OpenLocation } from "../attempt/feedback-actions";
import type { Workspace } from "../study-api";
import type { Files } from "./attempt-diff";
import { WorkspaceCommandsProvider } from "../workspace/workspace-commands-context";
import { AttemptDetails } from "./attempt-details";
import { useAttemptHistory } from "./use-attempt-history";

type AttemptHistoryProps = {
  workspace: Workspace;
  onOpenLocation?: OpenLocation;
  onAskSeymour?: AskSeymour;
  // Replaces the editor's files with an attempt's; the caller confirms or offers undo.
  onRestoreFiles?: (files: Files) => void;
};

type StepGroup = {
  stepId: string;
  stepIndex: number;
  title: string;
  attempts: AttemptSummary[];
};

// Groups keep the newest-first order of their attempts; the group with the latest attempt comes first.
function groupByStep(attempts: AttemptSummary[]) {
  const groups = new Map<string, StepGroup>();

  for (const attempt of attempts) {
    let group = groups.get(attempt.stepId);

    if (!group) {
      group = {
        stepId: attempt.stepId,
        stepIndex: attempt.stepIndex,
        title: attempt.stepTitle ?? "Earlier step",
        attempts: [],
      };
      groups.set(attempt.stepId, group);
    }

    group.attempts.push(attempt);
  }

  return [...groups.values()];
}

export function AttemptHistory({
  workspace,
  onOpenLocation,
  onAskSeymour,
  onRestoreFiles,
}: AttemptHistoryProps) {
  const history = useAttemptHistory(workspace);
  const { attempts, error } = history;
  const steps = workspace.roadmap.definition.steps;

  if (attempts.length === 0 && !error) {
    return (
      <EmptyState size="sm" className="py-10">
        <EmptyStateTitle as="h2">No attempts yet</EmptyStateTitle>
        <EmptyStateDescription>
          Use Check my solution to get a verdict. Each check appears here with
          its result.
        </EmptyStateDescription>
      </EmptyState>
    );
  }

  const groups = groupByStep(attempts);

  return (
    <WorkspaceCommandsProvider
      value={{ onOpenLocation, onAskSeymour, onRestoreFiles }}
    >
      <section aria-label="Attempt history" className="space-y-6 py-4">
        <h2 className="sr-only">Attempt history</h2>

        {error && (
          <div role="alert" className="space-y-2 text-destructive">
            <p>{toLearnerMessage(error)}</p>
            <Button size="sm" variant="outline" onClick={history.retry}>
              Try again
            </Button>
          </div>
        )}

        {groups.map((group, groupIndex) => (
          <section key={group.stepId} className="space-y-2">
            <h3 className="text-sm font-semibold">
              {group.stepIndex >= 0 ? `Step ${group.stepIndex + 1} · ` : ""}
              {group.title}
            </h3>

            <Accordion>
              {group.attempts.map((attempt, index) => {
                const number = group.attempts.length - index;
                const previous = group.attempts[index + 1];

                return (
                  <AccordionItem
                    key={attempt.id}
                    defaultOpen={groupIndex === 0 && index === 0}
                    className="last:border-b-0"
                  >
                    <AccordionTrigger size="sm">
                      <span className="flex flex-wrap items-center gap-2">
                        Attempt {number}
                        <span className="font-normal text-muted-foreground">
                          {formatRelativeTime(attempt.createdAt)}
                        </span>
                        <AttemptStatusBadge result={attempt.result} />
                      </span>
                    </AccordionTrigger>

                    <AccordionContent className="text-foreground">
                      <AttemptDetails
                        workspace={workspace}
                        attempt={attempt}
                        previous={previous}
                        finalStep={attempt.stepIndex === steps.length - 1}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </section>
        ))}

        {history.hasNextPage && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={history.loadingMore}
            onClick={history.loadOlder}
          >
            Show older attempts
          </Button>
        )}
      </section>
    </WorkspaceCommandsProvider>
  );
}
