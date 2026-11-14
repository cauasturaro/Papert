"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";
import type { MissingFile } from "./use-workspace-actions";

/** Offered when a link points at a workspace file that does not exist yet. */
export function MissingFileDialog({
  file,
  onCreate,
  onDismiss,
}: {
  file: MissingFile | null;
  onCreate: () => string | null;
  onDismiss: () => void;
}) {
  const [error, setError] = useState("");

  function create() {
    const problem = onCreate();

    setError(problem ?? "");
  }

  function close() {
    setError("");
    onDismiss();
  }

  return (
    <Dialog
      size="sm"
      open={file !== null}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Create this file?</DialogTitle>
        <DialogDescription>
          <span className="font-mono">{file?.path}</span> is not in your
          workspace yet. Create it as an empty file and open it?
        </DialogDescription>
      </DialogHeader>

      {error && (
        <p
          role="alert"
          className="px-(--dialog-padding) text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <DialogFooter className="justify-between">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>

        <Button onClick={create}>Create file</Button>
      </DialogFooter>
    </Dialog>
  );
}
