"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button/button";
import { Select, SelectItem } from "@/components/ui/select/select";
import { timeZoneChoices } from "./engagement-state";

type TimeZoneFieldProps = {
  timeZone: string;
  timeZoneSet: boolean;
  saving: boolean;
  error: string | null;
  onChoose: (zone: string) => Promise<unknown>;
};

function knownZones() {
  return Intl.supportedValuesOf("timeZone");
}

/** Shows the zone that dates study days and lets the learner change it. */
export function TimeZoneField({
  timeZone,
  timeZoneSet,
  saving,
  error,
  onChoose,
}: TimeZoneFieldProps) {
  const selectId = useId();
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(timeZone);
  const changeButton = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  // Focus follows the mode: into the select when editing, back to its button afterwards.
  useEffect(() => {
    if (editing) {
      opened.current = true;
      select.current?.focus();

      return;
    }

    if (opened.current) {
      changeButton.current?.focus();
    }
  }, [editing]);

  async function save() {
    try {
      await onChoose(choice);

      setEditing(false);
    } catch {
      // The hook shows the error; the field stays open to retry.
    }
  }

  function startEditing() {
    setChoice(timeZone);
    setEditing(true);
  }

  if (!editing) {
    return (
      <p className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <span>
          Days follow <span className="font-mono">{timeZone}</span>
          {timeZoneSet ? "." : " until your browser's time zone is saved."}
        </span>
        <Button
          ref={changeButton}
          size="sm"
          variant="ghost"
          onClick={startEditing}
        >
          Change time zone
        </Button>
      </p>
    );
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <label htmlFor={selectId} className="block text-sm font-medium">
        Time zone for study days
      </label>
      <p className="text-xs text-muted-foreground">
        Changing it affects the next study days only; days already counted stay
        as they are.
      </p>

      <div className="flex flex-wrap gap-2">
        <Select
          ref={select}
          id={selectId}
          size="sm"
          value={choice}
          onValueChange={setChoice}
          className="max-w-xs"
        >
          {timeZoneChoices(knownZones(), timeZone).map((zone) => (
            <SelectItem key={zone} value={zone}>
              {zone}
            </SelectItem>
          ))}
        </Select>

        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
