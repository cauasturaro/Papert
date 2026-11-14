"use client";

import { useRef, type RefObject } from "react";
import type { Workspace } from "../study-api";
import type { SessionCurrent } from "./workspace-session-state";
import { sameDraft } from "./workspace-session-state";
import {
  clearRecovery,
  readRecovery,
  restoreDraft,
  storeRecovery,
  type Recovery,
} from "./workspace-recovery";

const RECOVERY_DELAY_MS = 500;

export const STORAGE_UNAVAILABLE =
  "This browser cannot keep a copy of your changes. Keep this tab open or download your files.";

export function initialState(saved: Workspace) {
  let recovered: Recovery | null = null;
  let storageMessage = "";

  try {
    recovered = readRecovery(saved.id);
  } catch {
    storageMessage =
      "Could not read the copy of your changes on this device. Download your files before closing this tab.";
  }

  const restored = restoreDraft(saved, recovered);

  return { ...restored, storageMessage };
}

export function useDeviceDraftRecovery(
  currentRef: RefObject<SessionCurrent>,
  setMessage: (message: string) => void,
) {
  const recoveryTimer = useRef<number | undefined>(undefined);

  function writeRecovery() {
    window.clearTimeout(recoveryTimer.current);
    recoveryTimer.current = undefined;

    const { workspace: saved, draft: next } = currentRef.current;

    try {
      if (sameDraft(next, saved)) {
        clearRecovery(saved.id);
        return;
      }

      storeRecovery(saved.id, {
        ...next,
        revision: saved.revision,
        savedAt: Date.now(),
      });
    } catch {
      setMessage(STORAGE_UNAVAILABLE);
    }
  }

  // Writes the pending device copy now, such as when the tab is hidden or closed.
  function flushRecovery() {
    if (recoveryTimer.current !== undefined) {
      writeRecovery();
    }
  }

  function scheduleRecovery() {
    window.clearTimeout(recoveryTimer.current);
    recoveryTimer.current = window.setTimeout(writeRecovery, RECOVERY_DELAY_MS);
  }

  return { writeRecovery, flushRecovery, scheduleRecovery };
}
