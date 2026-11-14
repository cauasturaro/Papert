"use client";

import { Button } from "../button/button";
import { Input } from "../input/input";
import type { TreeEditorLabels } from "./tree-editor-labels";

type NameInputProps = {
  value: string;
  creating: boolean;
  invalid: boolean;
  errorId: string;
  size?: "sm" | "md" | "lg" | null;
  locked: boolean;
  labels: TreeEditorLabels;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

/** Inline name field for renaming an item or naming a new one. */
export function TreeEditorNameInput({
  value,
  creating,
  invalid,
  errorId,
  size,
  locked,
  labels,
  onChange,
  onSave,
  onCancel,
}: NameInputProps) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-slot="tree-editor-name-input"
      data-tree-draft={creating || undefined}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();

        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <Input
        aria-label={labels.name}
        placeholder={labels.name}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        size={size}
        disabled={locked}
        value={value}
        className="min-w-32 flex-1"
        ref={(element) => {
          if (element && document.activeElement !== element) {
            requestAnimationFrame(() => {
              element.focus();
              element.select();
            });
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSave();
          }
        }}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button size={size} disabled={locked} onClick={onSave}>
        {labels.save}
      </Button>
      <Button size={size} variant="ghost" onClick={onCancel}>
        {labels.cancel}
      </Button>
    </div>
  );
}
