"use client";

import { useRef, type KeyboardEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import { Progress } from "@/components/ui/progress/progress";
import { Select, SelectItem } from "@/components/ui/select/select";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip/tooltip";
import {
  ArrowUpIcon,
  BookIcon,
  FileIcon,
  SelectionIcon,
  StopIcon,
} from "@/components/icons";
import type { useSeymour, CodeSelection } from "./use-seymour";
import type { MentionTarget } from "./mentions";
import { useMentionPicker } from "./use-mention-picker";
import { MentionMenu } from "./mention-menu";
import {
  describe,
  reasoningEfforts,
  tutorModes,
  type SeymourOption,
} from "./seymour-options";

type SeymourComposerProps = {
  seymour: ReturnType<typeof useSeymour>;
  revision: number;
  activeFile?: string;
  selection?: CodeSelection;
  sources: MentionTarget[];
};

const compact = new Intl.NumberFormat("en", { notation: "compact" });

// The quota resets at 00:00 UTC; show that moment in the viewer's own time zone.
const resetTime = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

export function SeymourComposer({
  seymour,
  revision,
  activeFile,
  selection,
  sources,
}: SeymourComposerProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useMentionPicker(
    seymour.prompt,
    seymour.setPrompt,
    sources,
    textarea,
  );

  const locked = seymour.busy || seymour.running || seymour.pending;
  const canSend =
    !seymour.busy &&
    !seymour.running &&
    !seymour.blocked &&
    !!seymour.quota &&
    !!seymour.prompt.trim();

  // Enter sends, Shift+Enter adds a line; IME composition never sends.
  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (picker.handleKey(event)) {
      return;
    }

    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();

    if (canSend) {
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="shrink-0 space-y-2 p-3">
      {seymour.blocked && seymour.quota && (
        <Alert variant="destructive" size="sm" role="alert">
          <AlertDescription className="text-destructive">
            Not enough daily quota for another request (
            {compact.format(remainingTokens(seymour.quota))} left,{" "}
            {compact.format(seymour.quota.reservation)} needed). Resets{" "}
            {resetTime.format(seymour.quota.resetsAt)}.
          </AlertDescription>
        </Alert>
      )}

      <div className="relative">
        {picker.open && (
          <MentionMenu
            options={picker.options}
            highlighted={picker.highlighted}
            hasSources={sources.length > 0}
            onChoose={picker.choose}
          />
        )}

        <form
          aria-label="Message Seymour"
          className="@container overflow-hidden rounded-lg border border-border bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15"
          onSubmit={(event) => {
            event.preventDefault();

            void seymour.submit();
          }}
        >
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
            <ContextChip icon={<FileIcon />} label={activeFile ?? "No file"} />
            {selection && (
              <ContextChip
                icon={<SelectionIcon />}
                label={`Selection ${selection.start}–${selection.end}`}
              />
            )}
            {picker.mentioned.map((source) => (
              <ContextChip
                key={source.id}
                icon={<BookIcon />}
                label={source.filename}
              />
            ))}
          </div>

          <label htmlFor="execution-prompt" className="sr-only">
            Message about your saved revision {revision}
          </label>
          <textarea
            ref={textarea}
            id="execution-prompt"
            rows={3}
            maxLength={2000}
            placeholder={`Ask about saved revision ${revision}… Type @ to cite a source.`}
            value={seymour.prompt}
            disabled={locked}
            onChange={(event) => {
              const field = event.target;

              seymour.setPrompt(field.value);
              picker.track(field.value, field.selectionStart);
            }}
            onSelect={(event) => {
              const field = event.currentTarget;

              picker.track(field.value, field.selectionStart);
            }}
            onBlur={picker.close}
            onKeyDown={sendOnEnter}
            role="combobox"
            aria-expanded={picker.open}
            aria-controls="source-mentions"
            aria-autocomplete="list"
            aria-activedescendant={picker.activeOptionId}
            aria-describedby="composer-help"
            className="block max-h-48 min-h-16 w-full resize-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-60"
          />

          <div className="flex items-center gap-1 border-t border-border px-1.5 py-1.5">
            {/* Pills may truncate; the send button must always stay visible. */}
            <div className="flex min-w-0 items-center gap-0.5">
              <PillSelect
                label="Tutor mode"
                value={seymour.mode}
                options={tutorModes}
                disabled={locked}
                onValueChange={seymour.setMode}
              />
              <PillSelect
                label="Reasoning effort"
                value={seymour.effort}
                options={reasoningEfforts}
                disabled={locked}
                onValueChange={seymour.setEffort}
              />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              {seymour.quota && <QuotaMeter quota={seymour.quota} />}

              {seymour.pending && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  disabled={seymour.busy}
                  onClick={seymour.discardPending}
                >
                  Edit request
                </Button>
              )}

              {seymour.running ? (
                <Button
                  size="sm"
                  variant="outline"
                  iconOnly
                  className="rounded-full"
                  aria-label="Cancel"
                  disabled={seymour.busy}
                  onClick={() => void seymour.cancel()}
                >
                  <StopIcon />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  iconOnly
                  className="rounded-full"
                  aria-label={
                    seymour.pending ? "Retry request" : "Send saved revision"
                  }
                  disabled={!canSend}
                >
                  <ArrowUpIcon />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Visually hidden; still describes the message field to screen readers. */}
      <p id="composer-help" className="sr-only">
        {describe(tutorModes, seymour.mode)} ·{" "}
        {describe(reasoningEfforts, seymour.effort)}. Enter to send, Shift+Enter
        for a new line. Type @ to cite one of your workspace sources. Solution
        guidance requires attempts on three different saved revisions of this
        step.
      </p>
    </div>
  );
}

function ContextChip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

function PillSelect({
  label,
  value,
  options,
  disabled,
  onValueChange,
}: {
  label: string;
  value: string;
  options: SeymourOption[];
  disabled: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select
      size="sm"
      aria-label={label}
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      className="h-7 w-auto min-w-0 gap-1.5 rounded-full border-transparent bg-transparent px-2.5 text-xs font-medium enabled:hover:border-border enabled:hover:bg-accent"
    >
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </Select>
  );
}

type SeymourQuota = NonNullable<ReturnType<typeof useSeymour>["quota"]>;

function remainingTokens(quota: SeymourQuota) {
  return Math.max(0, quota.limit - quota.used - quota.reserved);
}

function QuotaMeter({ quota }: { quota: SeymourQuota }) {
  const consumed = quota.used + quota.reserved;
  const remaining = remainingTokens(quota);
  const reset = resetTime.format(quota.resetsAt);
  const details = `Tokens: ${remaining} left of ${quota.limit} (${quota.used} used + ${quota.reserved} held). Resets ${reset}. Sending needs ${quota.reservation} free tokens. If Seymour fails mid-answer it retries, up to three tries of ${quota.reservation} each, so tokens for the retries are held while it runs; whatever isn't spent comes back when it finishes.`;

  return (
    <Tooltip content={details} side="top">
      <TooltipTrigger
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-2 px-2 text-xs font-normal whitespace-nowrap text-muted-foreground"
        aria-label={`Token quota: ${remaining} of ${quota.limit} left`}
      >
        <Progress
          size="sm"
          className="w-8 @max-[22rem]:hidden"
          value={Math.min(consumed, quota.limit)}
          max={quota.limit}
          aria-hidden="true"
        />
        <span className="@max-[18rem]:sr-only">
          {compact.format(remaining)} left
        </span>
      </TooltipTrigger>
    </Tooltip>
  );
}
