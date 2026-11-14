"use client";

import { useEffect, useRef, useState } from "react";

export type SidePanel = "challenge" | "explorer" | "seymour";
export type CollapsedPanels = Record<SidePanel, boolean>;

const storageKey = "papert:study-collapsed-panels";

// Below this width the editor would get less than about 55% with every panel open.
const ROOMY_WIDTH = 1440;

const allCollapsed: CollapsedPanels = {
  challenge: true,
  explorer: true,
  seymour: true,
};

function defaults(): CollapsedPanels {
  return {
    challenge: false,
    explorer: false,
    seymour: window.innerWidth < ROOMY_WIDTH,
  };
}

function readStored(): CollapsedPanels {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");

    if (!stored) {
      return defaults();
    }

    return {
      challenge: stored.challenge === true,
      explorer: stored.explorer === true,
      seymour: stored.seymour === true,
    };
  } catch {
    // Missing or blocked storage falls back to the defaults for this screen.
    return defaults();
  }
}

/**
 * Which side panels are collapsed to rails, remembered per browser, plus a focus mode
 * that collapses them all and restores the previous arrangement when turned off.
 */
export function useCollapsedPanels() {
  // The workspace only renders on the client after it loads.
  const [collapsed, setCollapsed] = useState<CollapsedPanels>(readStored);
  const [focusMode, setFocusMode] = useState(false);
  const beforeFocus = useRef<CollapsedPanels | null>(null);

  useEffect(() => {
    // Focus mode is temporary; the stored choice stays the learner's own arrangement.
    if (focusMode) {
      return;
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(collapsed));
    } catch {
      // The choice still applies to this page view.
    }
  }, [collapsed, focusMode]);

  function setPanel(panel: SidePanel, value: boolean) {
    setFocusMode(false);
    setCollapsed((current) => ({ ...current, [panel]: value }));
  }

  function toggleFocusMode() {
    if (focusMode) {
      setFocusMode(false);
      setCollapsed(beforeFocus.current ?? collapsed);

      return;
    }

    beforeFocus.current = collapsed;

    setFocusMode(true);
    setCollapsed(allCollapsed);
  }

  return {
    collapsed,
    focusMode,
    collapse: (panel: SidePanel) => setPanel(panel, true),
    expand: (panel: SidePanel) => setPanel(panel, false),
    toggle: (panel: SidePanel) => setPanel(panel, !collapsed[panel]),
    toggleFocusMode,
  };
}
