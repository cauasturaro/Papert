"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";

type Choice = "mine" | "server";

/** Lets the learner resolve a workspace that was saved somewhere else meanwhile. */
export function ConflictDialog({
  open,
  onOpenChange,
  onKeepMine,
  onUseServer,
  onDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeepMine: () => Promise<boolean>;
  onUseServer: () => Promise<boolean>;
  onDownload: () => void;
}) {
  const [pending, setPending] = useState<Choice | null>(null);

  async function choose(choice: Choice) {
    setPending(choice);

    const resolved =
      choice === "mine" ? await onKeepMine() : await onUseServer();

    setPending(null);

    if (resolved) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      size="md"
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Your files changed somewhere else</DialogTitle>
        <DialogDescription>
          Another tab or device saved this workspace after you started editing
          here. Choose which version to keep.
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="space-y-2 text-sm">
        <p>
          <strong>Keep mine</strong> saves what you see here and replaces the
          other version.
        </p>
        <p>
          <strong>Use the saved version</strong> replaces your changes here with
          the other version. Download yours first if you want a copy.
        </p>
      </DialogContent>

      <DialogFooter className="flex-wrap justify-between gap-2 max-sm:flex-col-reverse">
        <Button
          variant="ghost"
          disabled={pending !== null}
          onClick={onDownload}
        >
          Download mine
        </Button>

        <div className="flex flex-wrap gap-2 max-sm:flex-col-reverse">
          <Button
            variant="outline"
            loading={pending === "server"}
            disabled={pending !== null}
            onClick={() => void choose("server")}
          >
            Use the saved version
          </Button>

          <Button
            loading={pending === "mine"}
            disabled={pending !== null}
            onClick={() => void choose("mine")}
          >
            Keep mine
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
