import { Button } from "@/components/ui/button/button";
import {
  FormDescription,
  FormField,
  FormLabel,
} from "@/components/ui/form-field/form-field";
import { Textarea } from "@/components/ui/textarea/textarea";
import { formatNumber } from "@/lib/format/number";
import { cn } from "@/lib/utils";

import { NOTES_LIMIT, NOTES_WARNING } from "./notes-policy";

type StudyNotesProps = {
  notes: string;
  onNotesChange: (notes: string) => void;
  // Saves now; notes otherwise save automatically with the workspace.
  onSave?: () => void;
  busy: boolean;
  saveBlocked: boolean;
};

/** Notes for the whole roadmap; they autosave with the code and never count as an attempt. */
export function StudyNotes({
  notes,
  onNotesChange,
  onSave,
  busy,
  saveBlocked,
}: StudyNotesProps) {
  const nearLimit = notes.length >= NOTES_WARNING;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" aria-busy={busy}>
      <FormField className="flex min-h-0 flex-1 flex-col">
        <FormLabel htmlFor="notes">Notes for this roadmap</FormLabel>
        <Textarea
          id="notes"
          maxLength={NOTES_LIMIT}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          disabled={busy}
          aria-describedby="notes-help notes-count"
          className="min-h-40 flex-1 resize-none"
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-2">
        <FormDescription id="notes-help" className="flex-1">
          Notes save automatically with your code and stay private. They are not
          checked: use Check my solution for that.
        </FormDescription>

        <p
          id="notes-count"
          className={cn(
            "text-xs tabular-nums",
            nearLimit ? "text-warning" : "text-muted-foreground",
          )}
        >
          {formatNumber(notes.length)} / {formatNumber(NOTES_LIMIT)}
          <span className="sr-only"> characters</span>
        </p>

        {onSave && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || saveBlocked}
            onClick={() => onSave()}
          >
            Save now
          </Button>
        )}
      </div>
    </div>
  );
}
