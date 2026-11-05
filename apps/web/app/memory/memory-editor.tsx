"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/input/input";
import { Select, SelectItem } from "@/components/ui/select/select";
import type { MemoryKind } from "./memory-api";
import { KIND_LABELS, MEMORY_MAX, memoryTextProblem } from "./memory-state";

// Typing may run past the limit so the counter can explain it instead of truncating silently.
const INPUT_SLACK = 20;

/** Kind and text of a durable memory; used to add, edit and adjust a suggestion. */
export function MemoryEditor({
  initialKind = "preference",
  initialText = "",
  label,
  saveLabel,
  pending,
  onSave,
  onCancel,
}: {
  initialKind?: MemoryKind;
  initialText?: string;
  label: string;
  saveLabel: string;
  pending: boolean;
  onSave: (kind: MemoryKind, text: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const textId = useId();
  const hintId = useId();
  const [kind, setKind] = useState<MemoryKind>(initialKind);
  const [text, setText] = useState(initialText);

  const problem = memoryTextProblem(text);
  // Only explain the rule once the learner has typed something.
  const shownProblem = text.trim() ? problem : null;

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (problem) {
      return;
    }

    try {
      await onSave(kind, text.trim());

      if (!onCancel) {
        setText("");
      }
    } catch {
      // The hook shows the server's message above the lists.
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-2">
      <label htmlFor={textId} className="sr-only">
        {label}
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          aria-label="Kind"
          value={kind}
          onValueChange={(value) => setKind(value as MemoryKind)}
          className="w-full sm:w-36"
        >
          <SelectItem value="preference">{KIND_LABELS.preference}</SelectItem>
          <SelectItem value="difficulty">{KIND_LABELS.difficulty}</SelectItem>
        </Select>

        <Input
          id={textId}
          value={text}
          maxLength={MEMORY_MAX + INPUT_SLACK}
          placeholder={
            kind === "preference"
              ? "For example: Show code examples in Python"
              : "For example: Confuses ports and adapters"
          }
          aria-describedby={hintId}
          aria-invalid={shownProblem ? true : undefined}
          onChange={(event) => setText(event.target.value)}
          className="flex-1"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p
          id={hintId}
          className={
            shownProblem
              ? "mr-auto text-xs text-destructive"
              : "mr-auto text-xs text-muted-foreground"
          }
        >
          {shownProblem ??
            `${[...text.trim()].length}/${MEMORY_MAX} characters`}
        </p>

        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}

        <Button type="submit" size="sm" disabled={!!problem || pending}>
          {pending ? "Saving…" : saveLabel}
        </Button>
      </div>
    </form>
  );
}
