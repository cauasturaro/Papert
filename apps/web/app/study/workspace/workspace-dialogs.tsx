"use client";

import { AlertDialog } from "@/components/ui/alert-dialog/alert-dialog";
import { ConflictDialog } from "./conflict-dialog";
import { MissingFileDialog } from "./missing-file-dialog";
import { ShortcutsDialog } from "./workspace-shortcuts";
import type { WorkspaceSession } from "./use-workspace-session";
import type { WorkspaceActions } from "./use-workspace-actions";

export function WorkspaceDialogs({
  session, actions, shortcutsOpen, setShortcutsOpen, conflictOpen, setConflictOpen,
}: {
  session: WorkspaceSession;
  actions: WorkspaceActions;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  conflictOpen: boolean;
  setConflictOpen: (open: boolean) => void;
}) {
  return (
    <>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <ConflictDialog
        open={conflictOpen && session.conflict}
        onOpenChange={setConflictOpen}
        onKeepMine={session.keepMine}
        onUseServer={session.loadServerVersion}
        onDownload={session.download}
      />

      <MissingFileDialog
        file={actions.missingFile}
        onCreate={actions.createMissingFile}
        onDismiss={actions.dismissMissingFile}
      />

      <AlertDialog
        size="sm"
        open={actions.restorePending}
        title="Replace your files?"
        description="Your current files will be replaced with the ones from this attempt. Download your files first if you want to keep a copy."
        confirmLabel="Replace files"
        onConfirm={actions.confirmRestore}
        onOpenChange={(open) => {
          if (!open) {
            actions.cancelRestore();
          }
        }}
      />
    </>
  );
}
