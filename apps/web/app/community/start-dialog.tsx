"use client";

import { useId, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";

/** Says what starting a published roadmap does before Papert creates the workspace. */
export function StartDialog({
  open,
  onOpenChange,
  title,
  pending,
  error,
  note,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  pending: boolean;
  error: string | null;
  // Extra consequences, such as a draft that will be discarded.
  note?: ReactNode;
  onConfirm: () => void;
}) {
  const titleId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      aria-labelledby={titleId}
    >
      <DialogHeader>
        <DialogTitle id={titleId}>Start “{title}”?</DialogTitle>
        <DialogDescription>
          Papert creates your own private workspace for this roadmap.
        </DialogDescription>
      </DialogHeader>

      <DialogContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            You get the starter files and the first step&apos;s challenge.
          </li>
          <li>Your code, notes and progress are private to you.</li>
          <li>The roadmap and its author never change.</li>
        </ul>

        {note}

        {error && (
          <Alert variant="destructive" size="sm" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </DialogContent>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>

        <Button type="button" loading={pending} onClick={onConfirm}>
          Start studying
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
