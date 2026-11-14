"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AskSeymour, OpenLocation } from "../attempt/feedback-actions";
import type { Files } from "./workspace-tree";

export type WorkspaceCommands = {
  onOpenLocation?: OpenLocation;
  onAskSeymour?: AskSeymour;
  onRestoreFiles?: (files: Files) => void;
};

const WorkspaceCommandsContext = createContext<WorkspaceCommands>({});

export function WorkspaceCommandsProvider({
  value,
  children,
}: {
  value: WorkspaceCommands;
  children: ReactNode;
}) {
  const parent = useWorkspaceCommands();
  const { onOpenLocation, onAskSeymour, onRestoreFiles } = value;
  const commands = useMemo(() => ({
    onOpenLocation: onOpenLocation ?? parent.onOpenLocation,
    onAskSeymour: onAskSeymour ?? parent.onAskSeymour,
    onRestoreFiles: onRestoreFiles ?? parent.onRestoreFiles,
  }), [onOpenLocation, onAskSeymour, onRestoreFiles, parent]);

  return (
    <WorkspaceCommandsContext.Provider value={commands}>
      {children}
    </WorkspaceCommandsContext.Provider>
  );
}

export function useWorkspaceCommands() {
  return useContext(WorkspaceCommandsContext);
}
