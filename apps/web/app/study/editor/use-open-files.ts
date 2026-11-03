"use client";

import { useState } from "react";
import type { Files } from "../workspace-tree";

function isOpenable(files: Files, path: string) {
  return Object.hasOwn(files, path) && !path.endsWith("/");
}

function firstFile(files: Files) {
  return Object.keys(files)
    .filter((path) => !path.endsWith("/"))
    .sort()[0];
}

/**
 * Editor tabs. Stored paths can go stale after a delete or an external reload,
 * so the visible tabs and the active tab are always derived from `files`.
 */
export function useOpenFiles(files: Files) {
  const [opened, setOpened] = useState<string[]>([]);
  // undefined until the learner picks or closes a tab; null means "none open".
  const [requestedActive, setRequestedActive] = useState<string | null>();

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
