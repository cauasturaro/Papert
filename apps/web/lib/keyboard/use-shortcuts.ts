"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  formatShortcut,
  isApplePlatform,
  isComposing,
  isEditableTarget,
  matchesShortcut,
} from "./shortcut";

export type ShortcutHandler = (event: KeyboardEvent) => void;

export type ShortcutOptions = {
  enabled?: boolean;
  // Also fire while focus is in an input, textarea, select, contenteditable or Monaco.
  allowInEditable?: boolean;
  // Defaults to true; set false to let the browser's own action happen as well.
  preventDefault?: boolean;
  // Listen in the capture phase, before Monaco or other widgets can stop the event.
  capture?: boolean;
  // Explicitly opt in only for commands owned by the visible modal.
  allowInModal?: boolean;
};

export type ShortcutMap = Record<string, ShortcutHandler>;

/**
 * Window-level keydown shortcuts. Keys are combos such as "Mod+S"; handlers may change
 * every render without re-subscribing. The first matching combo wins.
 */
export function useShortcuts(map: ShortcutMap, options: ShortcutOptions = {}) {
  const {
    enabled = true,
    allowInEditable = false,
    preventDefault = true,
    capture = false,
    allowInModal = false,
  } = options;

  const latest = useRef(map);

  useEffect(() => {
    latest.current = map;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const apple = isApplePlatform();

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isComposing(event)) {
        return;
      }

      if (
        !allowInModal &&
        document.querySelector('dialog[open], [aria-modal="true"]')
      ) {
        return;
      }

      if (!allowInEditable && isEditableTarget(event.target)) {
        return;
      }

      const entry = Object.entries(latest.current).find(([combo]) =>
        matchesShortcut(event, combo, apple),
      );

      if (!entry) {
        return;
      }

      if (preventDefault) {
        event.preventDefault();
      }

      entry[1](event);
    }

    window.addEventListener("keydown", onKeyDown, { capture });

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture });
    };
  }, [enabled, allowInEditable, preventDefault, capture, allowInModal]);
}

/** One shortcut; see `useShortcuts`. */
export function useShortcut(
  combo: string,
  handler: ShortcutHandler,
  options?: ShortcutOptions,
) {
  useShortcuts({ [combo]: handler }, options);
}

function subscribeToNothing() {
  return () => {};
}

/** Whether the learner is on an Apple platform; false during server rendering and hydration. */
export function useIsApplePlatform() {
  return useSyncExternalStore(subscribeToNothing, isApplePlatform, () => false);
}

/** Hydration-safe `formatShortcut`: "Ctrl+S" on the server, "⌘S" after hydration on a Mac. */
export function useShortcutLabel(combo: string) {
  const apple = useIsApplePlatform();

  return formatShortcut(combo, apple);
}
