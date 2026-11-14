"use client";

import { Button } from "@/components/ui/button/button";
import { ArrowDownIcon, ArrowUpIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { netVotes, nextVote } from "./catalog-state";
import type { Tally, Vote } from "./community-api";

/** Up/down arrows around the net votes; the active arrow is pressed. Authors only see counts. */
export function VoteControl({
  title,
  tally,
  disabled,
  readOnly,
  onVote,
}: {
  title: string;
  tally: Tally;
  disabled: boolean;
  readOnly: boolean;
  onVote: (value: Vote) => void;
}) {
  const net = netVotes(tally);
  const summary = `${tally.upvotes} up, ${tally.downvotes} down`;

  if (readOnly) {
    return (
      <p className="text-sm text-muted-foreground" title={summary}>
        <span className="font-semibold text-foreground tabular-nums">
          {net}
        </span>{" "}
        votes · yours
      </p>
    );
  }

  return (
    <div
      role="group"
      aria-label={`Vote on ${title}`}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5"
    >
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Upvote"
        aria-pressed={tally.myVote === 1}
        disabled={disabled}
        className={cn(tally.myVote === 1 && "bg-primary/25 text-foreground")}
        onClick={() => onVote(nextVote(tally.myVote, 1))}
      >
        <ArrowUpIcon />
      </Button>

      <span
        className="min-w-8 text-center text-sm font-semibold tabular-nums"
        title={summary}
      >
        {net}
        <span className="sr-only"> net votes: {summary}</span>
      </span>

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Downvote"
        aria-pressed={tally.myVote === -1}
        disabled={disabled}
        className={cn(
          tally.myVote === -1 && "bg-destructive/10 text-destructive",
        )}
        onClick={() => onVote(nextVote(tally.myVote, -1))}
      >
        <ArrowDownIcon />
      </Button>
    </div>
  );
}
