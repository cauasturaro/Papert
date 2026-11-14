"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { announce } from "@/lib/a11y/announcer";
import type { Workspace } from "../study-api";
import { useStableCallback } from "../use-stable-callback";
import { createEntry, type Files } from "./workspace-tree";
import type { EditorController } from "../editor/editor-controller";
import type { MobilePanel } from "../shell/study-layout";
import type { SidePanel } from "../shell/use-collapsed-panels";
import type { WorkspaceSession } from "./use-workspace-session";

/** Composer text for Seymour; `mode` switches the tutor mode when it is allowed. */
export type SeededPrompt = { id: number; text: string; mode?: string };

export type AskOptions = { mode?: "teaching" };

export type MissingFile = { path: string; line?: number };

type OpenFiles = {
  tabs: string[];
  active: string | null;
  open: (path: string) => void;
};

type Panels = {
  expand: (panel: SidePanel) => void;
};

function normalizePath(path: string) {
  return path.trim().replace(/^\.?\//, "");
}

/**
 * Cross-panel actions of the study IDE, ready to pass to the challenge, analysis and
 * Seymour panels: open a file at a line, insert code at the cursor, ask Seymour, choose
 * the viewed step and save everything. Every returned function is stable.
 */
export function useWorkspaceActions({
  session,
  openFiles,
  controller,
  panels,
  showPanel,
  initialStepId,
}: {
  session: WorkspaceSession;
  openFiles: OpenFiles;
  controller: EditorController;
  panels: Panels;
  showPanel: (panel: MobilePanel) => void;
  initialStepId: string | null;
}) {
  const { workspace, files } = session;
  const [seededPrompt, setSeededPrompt] = useState<SeededPrompt | null>(null);
  const [chatFocusRequest, setChatFocusRequest] = useState(0);
  const [missingFile, setMissingFile] = useState<MissingFile | null>(null);
  const [pendingRestore, setPendingRestore] = useState<Files | null>(null);
  const [viewedStepId, setViewedStepId] = useState<string | null>(() =>
    validStepId(workspace, initialStepId),
  );

  // Keyed by the joined paths, so typing keeps the same array for memoized panels.
  const pathKey = Object.keys(files)
    .filter((path) => !path.endsWith("/"))
    .sort()
    .join("\n");
  const workspaceFilePaths = useMemo(
    () => (pathKey ? pathKey.split("\n") : []),
    [pathKey],
  );

  // Keeps ?file= and ?step= current without adding history entries, so Back leaves the IDE.
  useEffect(() => {
    const url = new URL(window.location.href);

    if (openFiles.active) {
      url.searchParams.set("file", openFiles.active);
    } else {
      url.searchParams.delete("file");
    }

    if (viewedStepId) {
      url.searchParams.set("step", viewedStepId);
    } else {
      url.searchParams.delete("step");
    }

    if (url.href !== window.location.href) {
      window.history.replaceState(null, "", url);
    }
  }, [openFiles.active, viewedStepId]);

  const openLocation = useStableCallback((rawPath: string, line?: number) => {
    const path = normalizePath(rawPath);
    const exists = Object.hasOwn(files, path) && !path.endsWith("/");

    if (!exists) {
      setMissingFile({ path, line });
      return;
    }

    openFiles.open(path);
    showPanel("editor");
    controller.reveal(path, line ?? 1);
  });

  /** Creates the missing file offered by `openLocation`; returns an error message or null. */
  const createMissingFile = useStableCallback((): string | null => {
    if (!missingFile) {
      return null;
    }

    let updated: Files;

    try {
      updated = createEntry(files, missingFile.path);
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "That file cannot be created.";
    }

    session.setFiles(updated);
    openFiles.open(missingFile.path);
    showPanel("editor");
    setMissingFile(null);
    announce(`Created ${missingFile.path}.`);

    return null;
  });

  const insertAtCursor = useStableCallback((code: string) => {
    showPanel("editor");

    if (controller.insert(code)) {
      return;
    }

    // The editor may be hidden on small screens; try again once it is shown.
    requestAnimationFrame(() => {
      if (!controller.insert(code)) {
        announce("Open a file first, then insert the code.");
      }
    });
  });

  const askSeymour = useStableCallback((text: string, options?: AskOptions) => {
    panels.expand("seymour");
    showPanel("seymour");

    setSeededPrompt((current) => ({
      id: (current?.id ?? 0) + 1,
      text,
      mode: options?.mode,
    }));
  });

  const focusChat = useStableCallback(() => {
    panels.expand("seymour");
    showPanel("seymour");

    setChatFocusRequest((count) => count + 1);
  });

  // Restoring replaces the editor's files, so it waits for confirmation.
  const restoreFiles = useStableCallback((restored: Files) => {
    setPendingRestore(restored);
  });

  const confirmRestore = useStableCallback(() => {
    if (!pendingRestore) {
      return;
    }

    session.restoreFiles(pendingRestore);
    setPendingRestore(null);
    showPanel("editor");
  });

  const selectStep = useStableCallback((stepId: string | null) => {
    setViewedStepId(validStepId(workspace, stepId));
  });

  const saveAllChanges = useStableCallback(() => session.saveAllChanges());

  return {
    openLocation,
    insertAtCursor,
    selectStep,
    saveAllChanges,
    askSeymour,
    focusChat,
    // null means the current step.
    viewedStepId,
    hasUnsavedChanges: session.dirty,
    workspaceFilePaths,
    seededPrompt,
    chatFocusRequest,
    missingFile,
    createMissingFile,
    dismissMissingFile: useCallback(() => setMissingFile(null), []),
    restoreFiles,
    restorePending: pendingRestore !== null,
    confirmRestore,
    cancelRestore: useCallback(() => setPendingRestore(null), []),
  };
}

// The current step is the default view, so it is stored as null.
function validStepId(workspace: Workspace, stepId: string | null) {
  const steps = workspace.roadmap.definition.steps;
  const current = steps[workspace.currentStep]?.id;

  if (!stepId || stepId === current) {
    return null;
  }

  return steps.some((step) => step.id === stepId) ? stepId : null;
}

export type WorkspaceActions = ReturnType<typeof useWorkspaceActions>;
