"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { FlagIcon, ThumbDownIcon, ThumbUpIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  confirmation,
  nextFeedback,
  type FeedbackAction,
} from "./feedback-state";
import { HallucinationDialog } from "./hallucination-dialog";
import type { AnswerFeedbackActions } from "./use-answer-feedback";

/** Thumbs and a hallucination report under one finished Seymour answer or analysis. */
export function AnswerFeedback({
  executionId,
  subject,
  actions,
}: {
  executionId: string;
  subject: "answer" | "analysis";
  actions: AnswerFeedbackActions;
}) {
  const [reporting, setReporting] = useState(false);
  const feedback = actions.feedbackFor(executionId);
  const pending = actions.pendingId === executionId;
  const error = actions.errorFor(executionId);
  const rating = feedback?.rating;

  function send(action: FeedbackAction) {
    actions.rate(executionId, nextFeedback(action));
  }

  function report() {
    send("report");
    setReporting(false);
  }

  return (
    <div className="space-y-1 border-t border-border/60 pt-2 text-xs">
      <div
        role="group"
        aria-label={`Rate this ${subject}`}
        className="flex flex-wrap items-center gap-1"
      >
        <span className="mr-1 text-muted-foreground">
          {subject === "answer"
            ? "Was this helpful?"
            : "Was this analysis right?"}
        </span>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Thumbs up"
          aria-pressed={rating === "up"}
          disabled={pending}
          className={cn(rating === "up" && "bg-primary/25 text-foreground")}
          onClick={() => send("up")}
        >
          <ThumbUpIcon />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Thumbs down"
          aria-pressed={rating === "down"}
          disabled={pending}
          className={cn(
            rating === "down" && "bg-destructive/10 text-destructive",
          )}
          onClick={() => send("down")}
        >
          <ThumbDownIcon />
        </Button>

        {feedback?.hallucination ? (
          <>
            <Badge size="sm" variant="destructive" className="ml-1">
              Reported as hallucination
            </Badge>
            <Button
              variant="link"
              size="sm"
              disabled={pending}
              onClick={() => send("unreport")}
            >
              Undo report
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="ml-1"
            disabled={pending}
            onClick={() => setReporting(true)}
          >
            <FlagIcon />
            Report a hallucination
          </Button>
        )}
      </div>

      <p
        role="status"
        className={cn(error ? "text-destructive" : "text-muted-foreground")}
      >
        {error ?? confirmation(feedback)}
      </p>

      <HallucinationDialog
        open={reporting}
        subject={subject}
        pending={pending}
        onOpenChange={setReporting}
        onReport={report}
      />
    </div>
  );
}
