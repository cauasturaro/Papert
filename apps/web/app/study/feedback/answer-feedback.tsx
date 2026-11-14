"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip/tooltip";
import { FlagIcon, ThumbDownIcon, ThumbUpIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  confirmation,
  nextFeedback,
  type FeedbackAction,
} from "./feedback-state";
import { HallucinationDialog } from "./hallucination-dialog";
import type { AnswerFeedbackActions } from "./use-answer-feedback";

const THANKS_MS = 4000;

// After a thumbs-down, quick follow-ups the learner can put in the composer.
const FOLLOW_UPS = [
  {
    label: "Explain it more simply",
    prompt: "Can you explain that more simply?",
  },
  { label: "Use my code", prompt: "Can you explain that using my saved code?" },
  { label: "Shorter, please", prompt: "Can you give me a shorter answer?" },
];

/** Thumbs and a hallucination report under one finished Seymour answer or analysis. */
export function AnswerFeedback({
  executionId,
  subject,
  actions,
  onFollowUp,
}: {
  executionId: string;
  subject: "answer" | "analysis";
  actions: AnswerFeedbackActions;
  // Puts a follow-up question in the composer; offered after a thumbs-down.
  onFollowUp?: (prompt: string) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [thanks, setThanks] = useState(false);

  const feedback = actions.feedbackFor(executionId);
  const pending = actions.pendingFor(executionId);
  const clearing = actions.clearingFor(executionId);
  const error = actions.errorFor(executionId);

  // The verdict being sent (or removed) shows at once, so the pressed state never blinks.
  const shown = clearing ? undefined : (pending ?? feedback);
  const rating = shown?.rating;
  const reported = shown?.hallucination ?? false;

  // Only a verdict saved while this row is on screen shows the short thanks.
  const savedAt = feedback?.updatedAt;
  const firstSavedAt = useRef(savedAt);

  useEffect(() => {
    if (!savedAt || savedAt === firstSavedAt.current) {
      return;
    }

    setThanks(true);

    const timer = setTimeout(() => setThanks(false), THANKS_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [savedAt]);

  function send(action: FeedbackAction) {
    actions.rate(executionId, nextFeedback(action));
  }

  // Pressing the chosen thumb again removes the rating.
  function toggle(choice: "up" | "down") {
    if (rating === choice) {
      actions.clear(executionId);

      return;
    }

    send(choice);
  }

  function report() {
    send("report");
    setReporting(false);
  }

  let status = "";

  if (error) {
    status = error;
  } else if (thanks) {
    status = confirmation(feedback);
  }

  return (
    <div className="space-y-1 text-xs">
      <div
        role="group"
        aria-label={`Rate this ${subject}`}
        className="flex flex-wrap items-center gap-0.5"
      >
        <Tooltip
          content={rating === "up" ? "Remove rating" : "Helpful"}
          side="top"
        >
          <TooltipTrigger
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Helpful"
            aria-pressed={rating === "up"}
            className={cn(
              "size-7",
              rating === "up" && "bg-primary/25 text-foreground",
            )}
            onClick={() => toggle("up")}
          >
            <ThumbUpIcon />
          </TooltipTrigger>
        </Tooltip>

        <Tooltip
          content={rating === "down" ? "Remove rating" : "Not helpful"}
          side="top"
        >
          <TooltipTrigger
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Not helpful"
            aria-pressed={rating === "down"}
            className={cn(
              "size-7",
              rating === "down" && "bg-destructive/10 text-destructive",
            )}
            onClick={() => toggle("down")}
          >
            <ThumbDownIcon />
          </TooltipTrigger>
        </Tooltip>

        {reported ? (
          <>
            <Badge size="sm" variant="destructive" className="ml-1">
              Reported as hallucination
            </Badge>
            <Button
              variant="link"
              size="sm"
              className="h-7 text-xs"
              onClick={() => send("unreport")}
            >
              Undo report
            </Button>
          </>
        ) : (
          <Tooltip content="Report a hallucination" side="top">
            <TooltipTrigger
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Report a hallucination"
              className="size-7"
              onClick={() => setReporting(true)}
            >
              <FlagIcon />
            </TooltipTrigger>
          </Tooltip>
        )}
      </div>

      {rating === "down" && !reported && (
        <div
          role="group"
          aria-label="What would make it better?"
          className="flex flex-wrap gap-1"
        >
          {onFollowUp &&
            FOLLOW_UPS.map((followUp) => (
              <Button
                key={followUp.label}
                variant="outline"
                size="sm"
                className="h-6 rounded-full px-2 text-xs font-normal"
                onClick={() => onFollowUp(followUp.prompt)}
              >
                {followUp.label}
              </Button>
            ))}

          <Button
            variant="outline"
            size="sm"
            className="h-6 rounded-full px-2 text-xs font-normal"
            onClick={() => setReporting(true)}
          >
            Something in it is false
          </Button>
        </div>
      )}

      <p
        role="status"
        className={cn(
          "min-h-0 transition-opacity motion-reduce:transition-none",
          error ? "text-destructive" : "text-muted-foreground",
          status ? "opacity-100" : "opacity-0",
        )}
      >
        {status}
      </p>

      <HallucinationDialog
        open={reporting}
        subject={subject}
        pending={pending !== null}
        onOpenChange={setReporting}
        onReport={report}
      />
    </div>
  );
}
