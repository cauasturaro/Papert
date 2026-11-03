"use client";

import { useEffect, useState } from "react";

export type SidePanel = "challenge" | "seymour";
export type CollapsedPanels = Record<SidePanel, boolean>;

const storageKey = "papert:study-collapsed-panels";
const expanded: CollapsedPanels = { challenge: false, seymour: false };

function readStored(): CollapsedPanels {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");

    return {
      challenge: stored?.challenge === true,
      seymour: stored?.seymour === true,
    };
  } catch {
    // Missing or blocked storage falls back to both panels open.
    return expanded;
  }
}

/** Which side panels are collapsed to rails, remembered per browser. */
export function useCollapsedPanels() {
  // The workspace only renders on the client after the study starts.
  const [collapsed, setCollapsed] = useState<CollapsedPanels>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(collapsed));
    } catch {
      // The choice still applies to this page view.
    }
  }, [collapsed]);

  function setPanel(panel: SidePanel, value: boolean) {
    setCollapsed((current) => ({ ...current, [panel]: value }));
  }

  return {
    collapsed,
    collapse: (panel: SidePanel) => setPanel(panel, true),
    expand: (panel: SidePanel) => setPanel(panel, false),
  };
}
