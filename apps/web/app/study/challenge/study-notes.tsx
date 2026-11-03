import { Button } from "@/components/ui/button/button";
import {
  FormDescription,
  FormField,
  FormLabel,
} from "@/components/ui/form-field/form-field";
import { Textarea } from "@/components/ui/textarea/textarea";

type StudyNotesProps = {
  notes: string;
  onNotesChange: (notes: string) => void;
  /** Saves files and notes; `recordAttempt` also stores an attempt. */
  onSave: (recordAttempt?: boolean) => void;
  busy: boolean;
  saveBlocked: boolean;
};

export function StudyNotes({
  notes,
  onNotesChange,
  onSave,
  busy,
  saveBlocked,
}: StudyNotesProps) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();

        onSave();
      }}
      aria-busy={busy}
    >
      <FormField>
        <FormLabel htmlFor="notes">Study notes</FormLabel>
        <Textarea
          id="notes"
          rows={10}
          maxLength={8000}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          disabled={busy}
          aria-describedby="notes-help"
        />
      </FormField>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || saveBlocked}>
          Save notes
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || saveBlocked}
          onClick={() => onSave(true)}
        >
          Save notes and record attempt
        </Button>
      </div>

      <FormDescription id="notes-help">
        Recording an attempt preserves the saved files and criteria without
        analyzing them. Only an approved analysis unlocks the next step.
      </FormDescription>
    </form>
  );
}
