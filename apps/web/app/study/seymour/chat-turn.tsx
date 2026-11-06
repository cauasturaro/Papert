"use client";

import { Badge } from "@/components/ui/badge/badge";
import { proposalFor } from "../../memory/memory-state";
import type { MemoryActions } from "../../memory/use-memory";
import type { Execution } from "../execution-state";
import { AnswerFeedback } from "../feedback/answer-feedback";
import type { AnswerFeedbackActions } from "../feedback/use-answer-feedback";
import { AnswerSources } from "./answer-sources";
import { MemoryProposal } from "./memory-proposal";

// Only the followed job announces updates; past turns are static transcript.
export function ChatTurn({
  execution,
  live,
  memory,
  feedback,
}: {
  execution: Execution;
  live: boolean;
  memory: MemoryActions;
  feedback: AnswerFeedbackActions;
}) {
  const proposal = proposalFor(memory.items.data, execution.id);
  const used = execution.memoryUsed ?? 0;

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

          {used > 0 && (
            <span className="text-muted-foreground">
              Used {used} {used === 1 ? "memory" : "memories"}
            </span>
          )}
        </p>
        <p
          className="whitespace-pre-wrap"
          aria-live={live ? "polite" : undefined}
        >
          {execution.text}
        </p>

        {execution.grounding && (
          <AnswerSources grounding={execution.grounding} />
        )}

        {proposal && <MemoryProposal item={proposal} actions={memory} />}

        {execution.status === "completed" && (
          <AnswerFeedback
            executionId={execution.id}
            subject="answer"
            actions={feedback}
          />
        )}
      </div>
    </>
  );
}
