import { sameFiles, type Files } from "./workspace-tree.ts";

export type Draft = { files: Files; notes: string };
export type Recovery = Draft & { revision: number };

/** Validates a per-tab recovery record; throws when it is malformed. */
export function parseRecovery(stored: string): Recovery {
  const value: Recovery = JSON.parse(stored);

  const validFiles =
    !!value.files &&
    typeof value.files === "object" &&
    !Array.isArray(value.files) &&
    Object.values(value.files).every((content) => typeof content === "string");

  const validNotes =
    typeof value.notes === "string" && value.notes.length <= 8000;

  const validRevision = Number.isInteger(value.revision) && value.revision >= 0;

  if (!validFiles || !validNotes || !validRevision) {
    throw new Error("Invalid recovery data.");
  }

  return value;
}

const recoveryKey = (workspaceId: string) => `papert:workspace:${workspaceId}`;

/** Keeps the unsaved draft for this tab; throws when browser storage is unavailable. */
export function storeRecovery(workspaceId: string, recovery: Recovery) {
  sessionStorage.setItem(recoveryKey(workspaceId), JSON.stringify(recovery));
}

/** The tab's recovery record, or null; throws when storage or the record is unreadable. */
export function readRecovery(workspaceId: string): Recovery | null {
  const stored = sessionStorage.getItem(recoveryKey(workspaceId));

  if (!stored) {
    return null;
  }

  return parseRecovery(stored);
}

export function downloadDraft(draft: Draft) {
  const blob = new Blob([JSON.stringify(draft, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "papert-workspace.json";
  anchor.click();

  URL.revokeObjectURL(url);
}

/** Prefers the tab's unsaved draft; it conflicts when it was based on another revision. */
export function restoreDraft(
  saved: Draft & { revision: number },
  recovered: Recovery | null,
) {
  const draft: Draft = {
    files: recovered?.files ?? saved.files,
    notes: recovered?.notes ?? saved.notes,
  };
  const differs =
    !sameFiles(draft.files, saved.files) || draft.notes !== saved.notes;
  const conflict =
    !!recovered && differs && recovered.revision !== saved.revision;

  return { draft, differs, conflict };
}
