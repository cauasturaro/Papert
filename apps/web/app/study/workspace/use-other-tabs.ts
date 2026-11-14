"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { joinTabPresence } from "./tab-presence";

function newTabId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

/**
 * Notices other browser tabs showing the same workspace, and their saves, through a
 * BroadcastChannel. Browsers without it simply report no other tabs.
 */
export function useOtherTabs(
  workspaceId: string,
  onSavedElsewhere: (revision: number) => void,
) {
  const [others, setOthers] = useState<string[]>([]);
  const presence = useRef<ReturnType<typeof joinTabPresence> | null>(null);
  const latest = useRef(onSavedElsewhere);

  useEffect(() => {
    latest.current = onSavedElsewhere;
  });

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    const opened = new BroadcastChannel(`papert:workspace:${workspaceId}`);
    const joined = joinTabPresence({
      channel: opened,
      tabId: newTabId(),
      onOthersChange: setOthers,
      onSavedElsewhere: (revision) => latest.current(revision),
    });
    presence.current = joined;

    const leave = () => joined.leave();
    window.addEventListener("pagehide", leave);

    return () => {
      leave();
      window.removeEventListener("pagehide", leave);
      opened.close();
      presence.current = null;
      setOthers([]);
    };
  }, [workspaceId]);

  const announceSaved = useCallback((revision: number) => {
    presence.current?.announceSaved(revision);
  }, []);

  return { openElsewhere: others.length > 0, announceSaved };
}
