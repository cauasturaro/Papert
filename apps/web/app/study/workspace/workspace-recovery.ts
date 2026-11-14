import { NOTES_LIMIT } from "../challenge/notes-policy.ts";
import { sameFiles, type Files } from "./workspace-tree.ts";

export type Draft = { files: Files; notes: string };

/** Unsaved work kept on this device: the draft, the saved revision it started from and when it was written. */
export type Recovery = Draft & { revision: number; savedAt: number };

/** Validates a stored recovery record; throws when it is malformed. */
export function parseRecovery(stored: string): Recovery {
  const value = JSON.parse(stored);

  const validFiles =
    !!value?.files &&
    typeof value.files === "object" &&
    !Array.isArray(value.files) &&
    Object.values(value.files).every((content) => typeof content === "string");

  const validNotes =
    typeof value?.notes === "string" && value.notes.length <= NOTES_LIMIT;

  const validRevision =
    Number.isInteger(value?.revision) && value.revision >= 0;

  if (!validFiles || !validNotes || !validRevision) {
    throw new Error("Invalid recovery data.");
  }

  // Records written before the timestamp existed count as "just now".
  const savedAt =
    typeof value.savedAt === "number" && Number.isFinite(value.savedAt)
      ? value.savedAt
      : Date.now();

  return {
    files: value.files,
    notes: value.notes,
    revision: value.revision,
    savedAt,
  };
}

const recoveryKey = (workspaceId: string) => `papert:recovery:${workspaceId}`;

// Earlier versions kept the draft per tab only.
const sessionRecoveryKey = (workspaceId: string) =>
  `papert:workspace:${workspaceId}`;

/** Keeps the unsaved draft on this device; throws when browser storage is unavailable or full. */
export function storeRecovery(workspaceId: string, recovery: Recovery) {
  localStorage.setItem(recoveryKey(workspaceId), JSON.stringify(recovery));
}

/** Forgets the device copy once the server has the same content. */
export function clearRecovery(workspaceId: string) {
  localStorage.removeItem(recoveryKey(workspaceId));
  sessionStorage.removeItem(sessionRecoveryKey(workspaceId));
}

/** The device's recovery record, or null; throws when storage or the record is unreadable. */
export function readRecovery(workspaceId: string): Recovery | null {
  const stored =
    localStorage.getItem(recoveryKey(workspaceId)) ??
    sessionStorage.getItem(sessionRecoveryKey(workspaceId));

  if (!stored) {
    return null;
  }

  return parseRecovery(stored);
}

/** A file name such as "intro-to-react-files.json" for a roadmap title. */
export function draftFileName(title: string | undefined) {
  const slug = (title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${slug || "papert-workspace"}-files.json`;
}

export function downloadDraft(draft: Draft, title?: string) {
  const blob = new Blob([JSON.stringify(draft, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = draftFileName(title);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Some browsers start the download after click() returns; revoking at once can cancel it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Prefers the device's unsaved draft; it conflicts when it was based on another revision.
 * `recoveredAt` is set only when the restored draft differs from the saved one.
 */
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
  const recoveredAt = recovered && differs ? recovered.savedAt : null;

  return { draft, differs, conflict, recoveredAt };
}
