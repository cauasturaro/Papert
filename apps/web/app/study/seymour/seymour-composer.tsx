"use client";

import { useState, type KeyboardEvent, type RefObject } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import {
  ArrowUpIcon,
  BookIcon,
  CloseIcon,
  FileIcon,
  SelectionIcon,
  StopIcon,
} from "@/components/icons";
import { formatResetTime, formatWait } from "@/lib/format/time";
import { formatNumber } from "@/lib/format/number";
import { questionsLeft } from "../execution/execution-state";
import type { SeymourActions, CodeSelection } from "./use-seymour";
import type { MentionTarget } from "./mentions";
import { useMentionPicker } from "./use-mention-picker";
import { MentionMenu } from "./mention-menu";
import { OptionPicker } from "./option-picker";
import {
  describe,
  modeUnavailable,
  reasoningEfforts,
  tutorModes,
  type SolutionProgress,
} from "./seymour-options";
import { useCoarsePointer, useCountdown } from "./composer-hooks";
import { ContextChip } from "./context-chip";

export const PROMPT_LIMIT = 2000;
// Seymour reads at most this many characters of a selection.

export const SELECTION_LIMIT = 4000;

const COUNTER_FROM = 1600;

const MIN_ROWS = 2;

type SeymourComposerProps = {
  seymour: SeymourActions;
  textarea: RefObject<HTMLTextAreaElement | null>;
  activeFile?: string;
  targets: MentionTarget[];
  hasSources: boolean;
  unsavedChanges?: boolean;
  onSaveChanges?: () => Promise<boolean>;
  solution?: SolutionProgress | null;
  roadmapCompleted?: boolean;
};

function selectionLabel(selection: CodeSelection, activeFile?: string) {
  const file = activeFile ?? "the open file";
  const { startLine, endLine } = selection;

  if (startLine === undefined || endLine === undefined) {
    return `Selected code in ${file}`;
  }

  if (startLine === endLine) {
    return `line ${startLine} of ${file}`;
  }

  return `lines ${startLine}–${endLine} of ${file}`;
}

export function SeymourComposer({
  seymour,
  textarea,
  activeFile,
  targets,
  hasSources,
  unsavedChanges = false,
  onSaveChanges,
  solution,
  roadmapCompleted,
}: SeymourComposerProps) {
  const picker = useMentionPicker(
    seymour.prompt,
    seymour.setPrompt,
    targets,
    textarea,
  );
  const coarse = useCoarsePointer();
  const [saving, setSaving] = useState(false);

  const waitMs = useCountdown(seymour.error?.waitUntil ?? null);

  const shownSelection = seymour.selection;

  const unavailable = (mode: string) =>
    modeUnavailable(mode, { solution, roadmapCompleted });
  const modeProblem = unavailable(seymour.mode);

  const busy = seymour.sending || saving;
  const canSend =
    !busy &&
    !seymour.running &&
    !seymour.blocked &&
    !!seymour.quota &&
    waitMs === 0 &&
    modeProblem === null &&
    !!seymour.prompt.trim();

  async function saveAndAsk() {
    if (!onSaveChanges) {
      return;
    }

    setSaving(true);

    let saved = false;

    try {
      saved = await onSaveChanges();
    } finally {
      setSaving(false);
    }

    if (!saved || !seymour.prompt.trim()) {
      return;
    }

    // Let the saved revision render first, so the request names it.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await seymour.send();
  }

  // Fine pointers: Enter sends, Shift+Enter adds a line. IME composition never sends.
  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (picker.handleKey(event)) {
      return;
    }

    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      coarse ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();

    if (canSend) {
      event.currentTarget.form?.requestSubmit();
    }
  }

  const length = seymour.prompt.length;
  const quota = seymour.quota;

  return (
    <div className="shrink-0 space-y-2 p-3">
      {seymour.blocked && quota && (
        <Alert variant="warning" size="sm" role="alert">
          <AlertDescription>
            You have used today&apos;s Seymour allowance. It{" "}
            {formatResetTime(quota.resetsAt)}.
          </AlertDescription>
        </Alert>
      )}

      {seymour.reconnecting && (
        <p role="status" className="text-xs text-muted-foreground">
          Reconnecting…
        </p>
      )}

      {seymour.error && !seymour.reconnecting && (
        <Alert variant="destructive" size="sm" role="alert">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">{seymour.error.message}</span>

            {waitMs > 0 && (
              <span className="text-xs text-muted-foreground">
                Try again in {formatWait(waitMs)}.
              </span>
            )}

            {seymour.error.retry && waitMs === 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || seymour.running}
                onClick={() => void seymour.retryFailed()}
              >
                Retry
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label="Dismiss message"
              onClick={seymour.clearError}
            >
              <CloseIcon />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {unsavedChanges && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/50 px-2 py-1.5 text-xs">
          <span className="min-w-0 flex-1 text-muted-foreground">
            Seymour sees your last saved code.
          </span>

          {onSaveChanges && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              loading={saving}
              disabled={busy || seymour.running}
              onClick={() => void saveAndAsk()}
            >
              {seymour.prompt.trim() ? "Save and ask" : "Save changes"}
            </Button>
          )}
        </div>
      )}

      <div className="relative">
        {picker.open && (
          <MentionMenu
            options={picker.options}
            highlighted={picker.highlighted}
            hasTargets={targets.length > 0}
            onChoose={picker.choose}
          />
        )}

        <form
          aria-label="Message Seymour"
          className="@container overflow-hidden rounded-lg border border-border bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15"
          onSubmit={(event) => {
            event.preventDefault();

            if (canSend) {
              void seymour.send();
            }
          }}
        >
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
            <ContextChip
              icon={<FileIcon />}
              label={activeFile ?? "No file open"}
            />

            {shownSelection && (
              <ContextChip
                icon={<SelectionIcon />}
                label={selectionLabel(shownSelection, activeFile)}
                note={
                  shownSelection.end - shownSelection.start > SELECTION_LIMIT
                    ? `first ${formatNumber(SELECTION_LIMIT)} characters`
                    : undefined
                }
                onRemove={seymour.dropSelection}
              />
            )}

            {picker.mentioned.map((target) => (
              <ContextChip
                key={target.id}
                icon={target.kind === "file" ? <FileIcon /> : <BookIcon />}
                label={target.filename}
              />
            ))}
          </div>

          <label htmlFor="execution-prompt" className="sr-only">
            Message Seymour
          </label>
          <textarea
            ref={textarea}
            id="execution-prompt"
            rows={MIN_ROWS}
            maxLength={PROMPT_LIMIT}
            placeholder={
              hasSources
                ? "Ask Seymour… Type @ to mention a file or source."
                : "Ask Seymour… Type @ to mention a file."
            }
            value={seymour.prompt}
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
            onKeyDown={handleKey}
            role="combobox"
            aria-expanded={picker.open}
            aria-controls="source-mentions"
            aria-autocomplete="list"
            aria-activedescendant={picker.activeOptionId}
            aria-describedby="composer-help"
            // Grows with its content from two to ten lines (20 px each plus padding).
            className="block max-h-[216px] min-h-[56px] w-full resize-none overflow-y-auto bg-transparent px-3 py-2 [field-sizing:content] text-sm leading-5 text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          />

          <div className="flex items-center gap-1 border-t border-border px-1.5 py-1.5">
            {/* Pills may truncate; the send button must always stay visible. */}
            <div className="flex min-w-0 items-center gap-0.5">
              <OptionPicker
                label="Tutor mode"
                value={seymour.mode}
                options={tutorModes}
                unavailable={unavailable}
                onValueChange={seymour.setMode}
              />
              <OptionPicker
                label="Reasoning effort"
                value={seymour.effort}
                options={reasoningEfforts}
                onValueChange={seymour.setEffort}
              />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {length >= COUNTER_FROM && (
                <span
                  className={
                    length >= PROMPT_LIMIT
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {formatNumber(length)} / {formatNumber(PROMPT_LIMIT)}
                </span>
              )}

              {seymour.running ? (
                <Button
                  size="sm"
                  variant="outline"
                  iconOnly
                  className="rounded-full"
                  aria-label="Stop answer"
                  title="Stop answer (Esc)"
                  loading={seymour.stopping}
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
                  aria-label="Send"
                  loading={seymour.sending}
                  disabled={!canSend}
                >
                  <ArrowUpIcon />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {modeProblem && <span>Solution: {modeProblem}</span>}

        {quota && !seymour.blocked && (
          <span className="ml-auto">
            About {formatNumber(questionsLeft(quota))} questions left ·{" "}
            {formatResetTime(quota.resetsAt)}
          </span>
        )}
      </div>

      {/* Visually hidden; still describes the message field to screen readers. */}
      <p id="composer-help" className="sr-only">
        {describe(tutorModes, seymour.mode)}{" "}
        {describe(reasoningEfforts, seymour.effort)}{" "}
        {coarse
          ? "Use the Send button to send."
          : "Enter to send, Shift+Enter for a new line."}{" "}
        Escape stops an answer. Type @ to mention a code file or one of your
        sources.
      </p>
    </div>
  );
}
