"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Citation } from "./citations";
import { SourceViewer } from "./source-viewer";

export type Opening = { sourceId: string; citation?: Citation };

const OpenSourceContext = createContext<((opening: Opening) => void) | null>(
  null,
);

/** One viewer per workspace; chat citations and the Sources list open it. */
export function SourceViewerProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const [opening, setOpening] = useState<Opening | null>(null);

  return (
    <OpenSourceContext.Provider value={setOpening}>
      {children}

      <SourceViewer
        workspaceId={workspaceId}
        opening={opening}
        onClose={() => setOpening(null)}
      />
    </OpenSourceContext.Provider>
  );
}

export function useOpenSource() {
  const open = useContext(OpenSourceContext);

  if (!open) {
    throw new Error("useOpenSource must be used inside SourceViewerProvider.");
  }

  return open;
}
