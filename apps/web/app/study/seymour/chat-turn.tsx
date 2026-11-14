"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button/button";
import { Markdown } from "@/components/ui/markdown/markdown";
import { cn } from "@/lib/utils";
import type { MemoryItem } from "../../memory/memory-api";
import {
  failureMessage,
  progressLabel,
  turnState,
  type Execution,
} from "../execution/execution-state";
import { AnswerFeedback } from "../feedback/answer-feedback";
import type { AnswerFeedback as Feedback, FeedbackInput } from "../feedback/feedback-api";
import { AnswerSources } from "./answer-sources";
import { AskAgain } from "./ask-again";
import { CopyAnswer } from "./copy-answer";
import { MemoryProposal, type ProposalActions } from "./memory-proposal";
import { StudentMessage } from "./student-message";
import type { Question } from "./use-seymour";

/** What a turn can ask of the panel; callbacks may change identity between renders. */
export type TurnHandlers = {
  ask: (question: Question) => void;
  edit: (prompt: string) => void;
  followUp: (prompt: string) => void;
  openMemory: () => void;
  // Why a mode cannot be used now, or null.
  modeUnavailable: (mode: string) => string | null;
  insertCode?: (code: string) => void;
  openLocation?: (path: string) => void;
};

type ChatTurnProps = {
  execution: Execution;
  proposal: MemoryItem | undefined;
  memory: ProposalActions;
  feedback: Feedback | undefined;
  pendingFeedback: FeedbackInput | null;
  clearingFeedback: boolean;
  feedbackError: string | null;
  onRate: (executionId: string, input: FeedbackInput) => void;
  onClear: (executionId: string) => void;
  // Sending is not possible while another answer runs.
  canAsk: boolean;
  handlers: TurnHandlers;
};

function questionOf(execution: Execution): Question | null {
  if (!execution.prompt) {
    return null;
  }

  return {
    prompt: execution.prompt,
    mode: execution.mode ?? "doubt",
    effort: execution.effort ?? "low",
  };
}

function ChatTurnView({
  execution,
  proposal,
  memory,
  feedback,
  pendingFeedback,
  clearingFeedback,
  feedbackError,
  onRate,
  onClear,
  canAsk,
  handlers,
}: ChatTurnProps) {
  const state = turnState(execution);
  const question = questionOf(execution);
  const used = execution.memoryUsed ?? 0;

  return (
    <li className="space-y-2">
      {question && (
        <StudentMessage
          question={question}
          onEdit={() => handlers.edit(question.prompt)}
        />
      )}

      {state === "working" && (
        <div className="mr-4 flex items-center gap-2 rounded-lg rounded-bl-sm border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 animate-pulse rounded-full bg-ring motion-reduce:animate-none"
          />
          {progressLabel(execution)}
        </div>
      )}

      {(state === "failed" || state === "stopped") && (
        <div
          className={cn(
            "mr-4 space-y-2 rounded-lg rounded-bl-sm border px-3 py-2",
            state === "failed"
              ? "border-destructive/40 bg-destructive/5"
              : "border-border bg-muted",
          )}
        >
          <p className="text-sm">
            <span className="font-medium">
              {state === "failed" ? "Seymour couldn't answer. " : ""}
            </span>
            {failureMessage(execution)}
          </p>

          {question && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!canAsk}
              onClick={() => handlers.ask(question)}
            >
              {state === "failed" ? "Retry" : "Ask again"}
            </Button>
          )}
        </div>
      )}

      {state === "answered" && (
        <div className="mr-4 space-y-2 rounded-lg rounded-bl-sm border border-border bg-muted px-3 py-2">
          <Markdown
            source={execution.text}
            className="text-sm"
            onPathClick={handlers.openLocation}
            renderCodeActions={
              handlers.insertCode
                ? (code) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handlers.insertCode?.(code)}
                    >
                      Insert at cursor
                    </Button>
                  )
                : undefined
            }
          />

          {execution.grounding && (
            <AnswerSources grounding={execution.grounding} />
          )}

          <div className="flex flex-wrap items-center gap-1 border-t border-border/60 pt-1.5">
            <CopyAnswer text={execution.text} />

            {question && (
              <AskAgain
                question={question}
                disabled={!canAsk}
                handlers={handlers}
              />
            )}

            {used > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs font-normal text-muted-foreground"
                onClick={handlers.openMemory}
              >
                Used {used} {used === 1 ? "memory" : "memories"}
              </Button>
            )}

            <span className="ml-auto">
              <AnswerFeedback
                executionId={execution.id}
                subject="answer"
                actions={{
                  feedbackFor: () => feedback,
                  pendingFor: () => pendingFeedback,
                  clearingFor: () => clearingFeedback,
                  errorFor: () => feedbackError,
                  pendingId: pendingFeedback ? execution.id : null,
                  rate: onRate,
                  clear: onClear,
                }}
                onFollowUp={handlers.followUp}
              />
            </span>
          </div>

          {proposal && <MemoryProposal item={proposal} actions={memory} />}
        </div>
      )}
    </li>
  );
}

export const ChatTurn = memo(ChatTurnView);
