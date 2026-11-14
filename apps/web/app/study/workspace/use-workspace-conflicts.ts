"use client";

import type { RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { announce } from "@/lib/a11y/announcer";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { readWorkspace, type Workspace } from "../study-api";
import { studyKeys } from "../study-keys";
import { useMounted } from "../use-browser-session";
import type { Draft } from "./workspace-recovery";
import type { SaveFailure } from "./save-state";
import { sameDraft, type SessionCurrent } from "./workspace-session-state";

export function useWorkspaceConflicts({
  currentRef, setWorkspace, setDraft, setConflict, setFailure, setRecoveredAt,
  setMessage, writeRecovery, flush,
}: {
  currentRef: RefObject<SessionCurrent>;
  setWorkspace: (workspace: Workspace) => void;
  setDraft: (draft: Draft) => void;
  setConflict: (conflict: boolean) => void;
  setFailure: (failure: SaveFailure | null) => void;
  setRecoveredAt: (at: number | null) => void;
  setMessage: (message: string) => void;
  writeRecovery: () => void;
  flush: () => Promise<Workspace | null>;
}) {
  const queryClient = useQueryClient();
  const mounted = useMounted();

  async function fetchLatest() {
    return queryClient.fetchQuery({
      queryKey: studyKeys.workspace(currentRef.current.workspace.id),
      queryFn: () => readWorkspace(currentRef.current.workspace.id),
      staleTime: 0,
    });
  }

  function adoptServerVersion(result: Workspace) {
    const next = { files: result.files, notes: result.notes };
    currentRef.current = {
      workspace: result,
      draft: next,
      conflict: false,
      recoveredAt: null,
    };

    setWorkspace(result);
    setDraft(next);
    setConflict(false);
    setFailure(null);
    setRecoveredAt(null);
    setMessage("");

    writeRecovery();
  }

  // Another tab saved: an unchanged draft quietly follows; edited drafts meet the conflict on save.
  async function followRemoteSave(revision: number) {
    const saved = currentRef.current.workspace;

    if (
      revision <= saved.revision ||
      !sameDraft(currentRef.current.draft, saved)
    ) {
      return;
    }

    try {
      const result = await fetchLatest();

      if (sameDraft(currentRef.current.draft, saved) && mounted.current) {
        adoptServerVersion(result);
      }
    } catch {
      // The next save reports any problem.
    }
  }

  /** Replaces the local draft with the latest saved version. */
  async function loadServerVersion() {
    const draftBeforeReload = currentRef.current.draft;

    try {
      const result = await fetchLatest();

      if (currentRef.current.draft !== draftBeforeReload) {
        setMessage(
          "You kept editing, so your changes were not replaced. Choose again when you are ready.",
        );
        return false;
      }

      adoptServerVersion(result);
      announce("Loaded the latest saved version.");

      return true;
    } catch (error) {
      setMessage(toLearnerMessage(error));

      return false;
    }
  }

  /** Saves this tab's draft over the version saved elsewhere. */
  async function keepMine() {
    try {
      const latest = await fetchLatest();

      currentRef.current.workspace = latest;
      currentRef.current.conflict = false;

      setWorkspace(latest);
      setConflict(false);
      setMessage("");
    } catch (error) {
      setMessage(toLearnerMessage(error));

      return false;
    }

    const result = await flush();

    return result !== null;
  }

  return { followRemoteSave, loadServerVersion, keepMine };
}
