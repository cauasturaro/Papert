"use client";

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { announce } from "@/lib/a11y/announcer";
import { studyRequest, type Workspace } from "../study-api";
import { studyKeys } from "../study-keys";
import { validateTree } from "./workspace-tree";
import { deriveSaveState, saveAnnouncement, type SaveFailure } from "./save-state";
import { classifySaveFailure } from "./save-failure";
import {
  automaticSaveAllowed,
  sameDraft,
  savedWorkspace,
  type SavedRevision,
  type SessionCurrent,
} from "./workspace-session-state";

const AUTOSAVE_DELAY_MS = 700;

export function useWorkspaceSaving({
  currentRef, workspace, draft, dirty, conflict, recoveredAt, online, sessionExpired,
  setWorkspace, setConflict, writeRecovery, flushRecovery, announceSaved,
}: {
  currentRef: RefObject<SessionCurrent>;
  workspace: Workspace;
  draft: SessionCurrent["draft"];
  dirty: boolean;
  conflict: boolean;
  recoveredAt: number | null;
  online: boolean;
  sessionExpired: boolean;
  setWorkspace: (workspace: Workspace) => void;
  setConflict: (conflict: boolean) => void;
  writeRecovery: () => void;
  flushRecovery: () => void;
  announceSaved: (revision: number) => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const pending = useRef<Promise<SavedRevision> | null>(null);
  const attempts = useRef(0);

  function handleSaveError(error: unknown) {
    const outcome = classifySaveFailure(error, {
      attempts: attempts.current,
      online: navigator.onLine,
      now: Date.now(),
    });

    if (outcome.type === "conflict") {
      currentRef.current.conflict = true;

      setConflict(true);
      setFailure(null);

      return;
    }

    if (outcome.retried) {
      attempts.current += 1;
    }

    setFailure(outcome.failure);
  }

  async function flush(
    mode: "explicit" | "automatic" = "explicit",
  ): Promise<Workspace | null> {
    if (
      mode === "automatic" &&
      !automaticSaveAllowed(currentRef.current, online, sessionExpired)
    ) {
      return null;
    }

    if (pending.current) {
      try {
        await pending.current;
      } catch {
        return null;
      }

      return flush(mode);
    }

    const {
      workspace: saved,
      draft: next,
      conflict: blocked,
    } = currentRef.current;

    if (blocked) {
      return null;
    }

    if (sameDraft(next, saved)) {
      return saved;
    }

    try {
      validateTree(next.files);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Some files are not valid.";

      setFailure({ kind: "invalid", message: reason });

      return null;
    }

    return persistDraft(saved, next);
  }

  async function persistDraft(saved: Workspace, next: SessionCurrent["draft"]) {
    setSaving(true);

    // The summary response carries only the new revision; the sent draft is what was saved.
    const operation = studyRequest<SavedRevision>(
      `workspaces/${saved.id}?response=summary`,
      "PUT",
      {
        revision: saved.revision,
        files: next.files,
        notes: next.notes,
      },
    );
    pending.current = operation;

    try {
      const summary = await operation;

      return acceptSavedDraft(saved, next, summary);
    } catch (error) {
      handleSaveError(error);

      return null;
    } finally {
      pending.current = null;

      setSaving(false);
    }
  }

  function acceptSavedDraft(
    saved: Workspace,
    next: SessionCurrent["draft"],
    summary: SavedRevision,
  ) {
    // A refresh during the request may have brought newer attempts for the same revision.
    const latest = currentRef.current.workspace;
    const base = latest.revision === saved.revision ? latest : saved;
    const result = savedWorkspace(base, next, summary);

    // Only advance the saved revision; typing during the request stays in the draft.
    currentRef.current.workspace = result;
    attempts.current = 0;
    writeRecovery();
    announceSaved(result.revision);

    // Also applied while the route is hidden after navigating away, so it is current on return.
    setWorkspace(result);
    setSavedAt(Date.now());
    setFailure(null);
    queryClient.setQueryData(studyKeys.workspace(result.id), result);

    return result;
  }

  const autosavePaused =
    conflict ||
    !online ||
    sessionExpired ||
    recoveredAt !== null ||
    failure !== null;

  // Effect events read the latest draft and refs without rescheduling timers.
  const flushLater = useEffectEvent(() => {
    void flush("automatic");
  });
  const keepRecovery = useEffectEvent(() => {
    flushRecovery();
  });

  useEffect(() => {
    if (!dirty || autosavePaused) {
      return;
    }

    const timer = window.setTimeout(() => flushLater(), AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
    // Only new drafts, revisions or a lifted pause schedule a save.
  }, [draft, workspace, autosavePaused, dirty]);

  // Automatic retry with backoff after a network or server failure.
  useEffect(() => {
    if (failure?.kind !== "retrying" || failure.retryAt === undefined) {
      return;
    }

    const wait = Math.max(0, failure.retryAt - Date.now());
    const timer = window.setTimeout(() => flushLater(), wait);

    return () => window.clearTimeout(timer);
  }, [failure]);

  // Reconnecting or signing in again lifts a paused retry so autosave resumes at once.
  const resumeKey = `${online}:${sessionExpired}`;
  const [lastResumeKey, setLastResumeKey] = useState(resumeKey);

  if (resumeKey !== lastResumeKey) {
    setLastResumeKey(resumeKey);

    const paused = failure?.kind === "retrying" || failure?.kind === "failed";

    if (online && !sessionExpired && paused) {
      setFailure(null);
    }
  }

  // Keeps the device copy current when the tab is hidden or closed, and saves when the route is left.
  useEffect(() => {
    const onPageHide = () => keepRecovery();
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        keepRecovery();
      }
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHide);
      keepRecovery();

      // Leaving the study view still sends pending edits; the device copy covers failures.
      flushLater();
    };
  }, []);

  const saveState = deriveSaveState({
    dirty,
    saving,
    online,
    conflict,
    sessionExpired,
    failure,
  });
  const previousSaveState = useRef(saveState);

  useEffect(() => {
    const phrase = saveAnnouncement(previousSaveState.current, saveState);
    previousSaveState.current = saveState;

    if (phrase) {
      announce(phrase);
    }
  }, [saveState]);

  return { flush, failure, setFailure, savedAt, saveState };
}
