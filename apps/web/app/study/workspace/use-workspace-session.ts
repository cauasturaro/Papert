"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { announce } from "@/lib/a11y/announcer";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { useSessionExpired } from "@/lib/auth/use-session-expired";
import { readWorkspace, type Workspace } from "../study-api";
import { studyKeys } from "../study-keys";
import type { Files } from "./workspace-tree";
import { useLeaveWarning, useOnline } from "../use-browser-session";
import { downloadDraft, type Draft } from "./workspace-recovery";
import { useOtherTabs } from "./use-other-tabs";
import { sameDraft, type SessionCurrent } from "./workspace-session-state";
import {
  initialState,
  STORAGE_UNAVAILABLE,
  useDeviceDraftRecovery,
} from "./use-device-draft-recovery";
import { useWorkspaceSaving } from "./use-workspace-saving";
import { useWorkspaceConflicts } from "./use-workspace-conflicts";

/**
 * Draft, autosave and recovery for one open workspace. Unsaved work is copied to this
 * device (debounced) so a reload, crash or expired session never loses it.
 */
export function useWorkspaceSession(initialWorkspace: Workspace) {
  const queryClient = useQueryClient();
  const [initial] = useState(() => initialState(initialWorkspace));
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [conflict, setConflict] = useState(initial.conflict);
  // A recovered draft waits for Keep or Discard before autosave sends it.
  const [recoveredAt, setRecoveredAt] = useState<number | null>(
    initial.conflict ? null : initial.recoveredAt,
  );
  const [message, setMessage] = useState(initial.storageMessage);
  const online = useOnline();
  const session = useSessionExpired();

  const current = useRef<SessionCurrent>({
    workspace,
    draft,
    conflict,
    recoveredAt,
  });

  const dirty = !sameDraft(draft, workspace);
  const title = workspace.roadmap.definition.title;

  useLeaveWarning(dirty);

  const recovery = useDeviceDraftRecovery(current, setMessage);
  const { writeRecovery, scheduleRecovery } = recovery;
  const saving = useWorkspaceSaving({
    currentRef: current, workspace, draft, dirty, conflict, recoveredAt, online,
    sessionExpired: session.expired, setWorkspace, setConflict,
    writeRecovery, flushRecovery: recovery.flushRecovery,
    announceSaved,
  });
  const { flush, failure, setFailure, savedAt, saveState } = saving;
  const conflicts = useWorkspaceConflicts({
    currentRef: current, setWorkspace, setDraft, setConflict, setFailure, setRecoveredAt,
    setMessage, writeRecovery, flush,
  });
  const { keepMine, loadServerVersion } = conflicts;

  const tabs = useOtherTabs(workspace.id, (revision) => {
    void conflicts.followRemoteSave(revision);
  });

  function announceSaved(revision: number) {
    tabs.announceSaved(revision);
  }

  function updateDraft(next: Draft) {
    current.current.draft = next;

    setDraft(next);
    setMessage((text) => (text === STORAGE_UNAVAILABLE ? text : ""));

    // A new edit may fix the problem; scheduled network retries keep their own timer.
    setFailure((previous) => (previous?.kind === "retrying" ? previous : null));

    scheduleRecovery();
  }

  function keepRecovered() {
    current.current.recoveredAt = null;

    setRecoveredAt(null);
  }

  function discardRecovered() {
    const saved = current.current.workspace;
    const next = { files: saved.files, notes: saved.notes };
    current.current.draft = next;
    current.current.recoveredAt = null;

    setDraft(next);
    setRecoveredAt(null);

    writeRecovery();
  }

  async function save() {
    setMessage("");

    await flush();
  }

  /** Puts an earlier attempt's files in the editor as unsaved changes; autosave keeps them. */
  function restoreFiles(files: Files) {
    updateDraft({ ...current.current.draft, files });

    announce("Restored the files from that attempt.");
  }

  /** Saves every pending change; true when the server has the current draft. */
  async function saveAllChanges() {
    setMessage("");

    const saved = await flush();

    return saved !== null && sameDraft(current.current.draft, saved);
  }

  // Analysis always targets an acknowledged revision, never unsaved editor text.
  async function prepareAnalysis() {
    setMessage("");

    const saved = await flush();

    return saved ? saved.revision : null;
  }

  // Results and progression change attempts and the current step, not the saved revision.
  async function refresh() {
    const saved = current.current.workspace;

    try {
      const result = await readWorkspace(saved.id);

      if (current.current.workspace.revision === result.revision) {
        current.current.workspace = result;

        setWorkspace(result);
        queryClient.setQueryData(studyKeys.workspace(result.id), result);
      }
    } catch (error) {
      setMessage(toLearnerMessage(error));
    }
  }

  return {
    workspace,
    files: draft.files,
    notes: draft.notes,
    setFiles: (files: Files) =>
      updateDraft({ ...current.current.draft, files }),
    setNotes: (notes: string) =>
      updateDraft({ ...current.current.draft, notes }),
    dirty,
    saveState,
    savedAt,
    failure,
    message,
    dismissMessage: () => setMessage(""),
    conflict,
    online,
    sessionExpired: session.expired,
    signInHref: session.signInHref,
    openElsewhere: tabs.openElsewhere,
    recoveredAt,
    keepRecovered,
    discardRecovered,
    keepMine,
    loadServerVersion,
    download: () => downloadDraft(current.current.draft, title),
    save,
    restoreFiles,
    saveAllChanges,
    prepareAnalysis,
    refresh,
  };
}

export type WorkspaceSession = ReturnType<typeof useWorkspaceSession>;
