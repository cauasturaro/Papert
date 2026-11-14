"use client";

import { useEffect, useState } from "react";
import type { Files } from "../workspace/workspace-tree";

function isOpenable(files: Files, path: string) {
  return Object.hasOwn(files, path) && !path.endsWith("/");
}

function firstFile(files: Files) {
  return Object.keys(files)
    .filter((path) => !path.endsWith("/"))
    .sort()[0];
}

type StoredTabs = { tabs: string[]; active: string | null };

const storageKey = (workspaceId: string) => `papert:study-tabs:${workspaceId}`;

function readStoredTabs(workspaceId: string): StoredTabs | null {
  try {
    const stored = JSON.parse(
      localStorage.getItem(storageKey(workspaceId)) ?? "null",
    );

    if (!stored || !Array.isArray(stored.tabs)) {
      return null;
    }

    const tabs = stored.tabs.filter(
      (path: unknown): path is string => typeof path === "string",
    );
    const active = typeof stored.active === "string" ? stored.active : null;

    return { tabs, active };
  } catch {
    return null;
  }
}

/**
 * Editor tabs, restored per workspace on this device. Stored paths can go stale after a
 * delete or an external reload, so the visible tabs and the active tab are always derived
 * from `files`. `initialFile` (from the address) wins over the stored active tab.
 */
export function useOpenFiles(
  files: Files,
  workspaceId: string,
  initialFile: string | null,
) {
  const [restored] = useState(() => readStoredTabs(workspaceId));
  const [opened, setOpened] = useState<string[]>(() => {
    const tabs = restored?.tabs ?? [];

    return initialFile && !tabs.includes(initialFile)
      ? [...tabs, initialFile]
      : tabs;
  });
  // undefined until the learner picks or closes a tab; null means "none open".
  const [requestedActive, setRequestedActive] = useState<
    string | null | undefined
  >(initialFile ?? restored?.active ?? undefined);

  const tabs = opened.filter((path) => isOpenable(files, path));
  const initial = requestedActive === undefined ? firstFile(files) : undefined;
  const fallback = tabs[tabs.length - 1] ?? initial ?? null;
  const active =
    requestedActive && isOpenable(files, requestedActive)
      ? requestedActive
      : fallback;

  // A fallback file that is shown but was never opened still gets a tab.
  if (active && !tabs.includes(active)) {
    tabs.push(active);
  }

  const tabsKey = tabs.join("\n");

  useEffect(() => {
    try {
      const stored: StoredTabs = {
        tabs: tabsKey ? tabsKey.split("\n") : [],
        active,
      };
      localStorage.setItem(storageKey(workspaceId), JSON.stringify(stored));
    } catch {
      // Tabs still work for this page view.
    }
  }, [workspaceId, tabsKey, active]);

  // No existence check: a just-created file is not in `files` until the next
  // render, and stale paths are filtered out when tabs are derived.
  function open(path: string) {
    setOpened((current) => {
      const shown = tabs.filter((tab) => !current.includes(tab));
      const kept = [...current, ...shown];

      return kept.includes(path) ? kept : [...kept, path];
    });
    setRequestedActive(path);
  }

  function close(path: string) {
    const index = tabs.indexOf(path);
    const remaining = tabs.filter((tab) => tab !== path);

    setOpened(remaining);

    if (path === active) {
      setRequestedActive(remaining[Math.max(0, index - 1)] ?? null);
    }
  }

  /** Follows a rename or move of a file or a whole directory. */
  function rename(from: string, to: string) {
    const follow = (path: string) =>
      path === from || (from.endsWith("/") && path.startsWith(from))
        ? `${to}${path.slice(from.length)}`
        : path;

    setOpened((current) => current.map(follow));
    setRequestedActive((current) =>
      typeof current === "string" ? follow(current) : current,
    );
  }

  return { tabs, active, open, close, rename };
}
