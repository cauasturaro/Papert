import { formatRelativeTime } from "../../../lib/format/time.ts";

export type SaveState =
  | "saved"
  | "unsaved"
  | "saving"
  | "offline"
  | "retrying"
  | "failed"
  | "invalid"
  | "conflict"
  | "signed_out";

export type SaveFailure = {
  kind: "retrying" | "failed" | "invalid";
  message: string;
  // Epoch milliseconds of the next automatic attempt, for "retrying".
  retryAt?: number;
};

export type SaveInputs = {
  dirty: boolean;
  saving: boolean;
  online: boolean;
  conflict: boolean;
  sessionExpired: boolean;
  failure: SaveFailure | null;
};

/** One state for the save indicator; the most urgent condition wins. */
export function deriveSaveState(inputs: SaveInputs): SaveState {
  if (inputs.conflict) {
    return "conflict";
  }

  if (inputs.sessionExpired && inputs.dirty) {
    return "signed_out";
  }

  if (!inputs.online && inputs.dirty) {
    return "offline";
  }

  if (inputs.saving) {
    return "saving";
  }

  if (inputs.failure && inputs.dirty) {
    return inputs.failure.kind;
  }

  return inputs.dirty ? "unsaved" : "saved";
}

export type SaveTone = "success" | "neutral" | "warning" | "destructive";

export function saveTone(state: SaveState): SaveTone {
  switch (state) {
    case "saved":
      return "success";

    case "conflict":
    case "failed":
      return "destructive";

    case "offline":
    case "retrying":
    case "invalid":
    case "signed_out":
      return "warning";

    default:
      return "neutral";
  }
}

/** Short indicator text, such as "Saved · just now" or "Couldn't save — retrying in 8 s". */
export function saveLabel(
  state: SaveState,
  details: { savedAt: number | null; retryAt?: number; now: number },
) {
  switch (state) {
    case "saved":
      return details.savedAt === null
        ? "Saved"
        : `Saved · ${formatRelativeTime(details.savedAt, details.now)}`;

    case "unsaved":
      return "Unsaved changes";

    case "saving":
      return "Saving…";

    case "offline":
      return "Offline — changes kept on this device";

    case "retrying": {
      if (details.retryAt === undefined) {
        return "Couldn't save — retrying";
      }

      const seconds = Math.max(
        1,
        Math.ceil((details.retryAt - details.now) / 1000),
      );

      return `Couldn't save — retrying in ${seconds} s`;
    }

    case "failed":
      return "Couldn't save";

    case "invalid":
      return "Couldn't save — check your files";

    case "conflict":
      return "Changed elsewhere";

    case "signed_out":
      return "Signed out — changes kept on this device";
  }
}

/** Visible phone label; recovery banners carry the longer explanation. */
export function compactSaveLabel(state: SaveState) {
  const labels: Record<SaveState, string> = {
    saved: "Saved",
    unsaved: "Unsaved",
    saving: "Saving…",
    offline: "Offline",
    retrying: "Retrying…",
    failed: "Not saved",
    invalid: "Check files",
    conflict: "Conflict",
    signed_out: "Signed out",
  };

  return labels[state];
}

const troubled: SaveState[] = [
  "offline",
  "retrying",
  "failed",
  "invalid",
  "conflict",
  "signed_out",
];

/**
 * Phrase for screen readers when the state changes meaningfully; null for routine autosaves
 * (unsaved → saving → saved) so typing is not interrupted.
 */
export function saveAnnouncement(previous: SaveState, next: SaveState) {
  if (previous === next) {
    return null;
  }

  if (next === "saved") {
    return troubled.includes(previous) ? "All changes saved." : null;
  }

  if (next === "offline") {
    return "You are offline. Your changes are kept on this device.";
  }

  if (previous === "offline") {
    return "Back online.";
  }

  if (next === "retrying" || next === "failed") {
    return "Your changes could not be saved yet.";
  }

  if (next === "invalid") {
    return "Your changes could not be saved. Check your files.";
  }

  if (next === "conflict") {
    return "This workspace changed somewhere else.";
  }

  return null;
}

const MAX_RETRY_MS = 60_000;

/** Exponential backoff for automatic save retries: 2 s, 4 s, 8 s … up to a minute. */
export function retryDelay(attempt: number, serverWait: number | null) {
  if (serverWait !== null) {
    return Math.min(MAX_RETRY_MS, Math.max(1000, serverWait));
  }

  return Math.min(MAX_RETRY_MS, 2000 * 2 ** Math.max(0, attempt));
}
