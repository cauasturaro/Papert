import type { Workspace } from "../study-api";
import type { Draft } from "./workspace-recovery";
import { sameFiles } from "./workspace-tree.ts";

export type SessionCurrent = {
  workspace: Workspace;
  draft: Draft;
  conflict: boolean;
  recoveredAt: number | null;
};

export function automaticSaveAllowed(
  state: Pick<SessionCurrent, "conflict" | "recoveredAt">,
  online: boolean,
  sessionExpired: boolean,
) {
  return !state.conflict && state.recoveredAt === null && online && !sessionExpired;
}

export type SavedRevision = { id: string; revision: number };

// What the server now holds: the saved workspace with the sent draft at the new revision.
export function savedWorkspace(
  saved: Workspace,
  sent: Draft,
  summary: SavedRevision,
): Workspace {
  return {
    ...saved,
    revision: summary.revision,
    files: sent.files,
    notes: sent.notes,
  };
}

export function sameDraft(draft: Draft, saved: Draft) {
  return sameFiles(draft.files, saved.files) && draft.notes === saved.notes;
}
