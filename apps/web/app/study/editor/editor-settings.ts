"use client";

import { useEffect, useState } from "react";

export type EditorSettings = {
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  plainText: boolean;
};

export const fontSizes = [12, 13, 14, 16, 18];

const storageKey = "papert:editor-settings";

const defaults: EditorSettings = {
  fontSize: 13,
  wordWrap: true,
  minimap: false,
  plainText: false,
};

function readStored(): EditorSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");

    return {
      fontSize: fontSizes.includes(stored?.fontSize)
        ? stored.fontSize
        : defaults.fontSize,
      wordWrap:
        typeof stored?.wordWrap === "boolean"
          ? stored.wordWrap
          : defaults.wordWrap,
      minimap: stored?.minimap === true,
      plainText: stored?.plainText === true,
    };
  } catch {
    return defaults;
  }
}

/** Font size, wrapping, minimap and the plain text editor, remembered per browser. */
export function useEditorSettings() {
  // The editor renders only on the client, after the workspace loads.
  const [settings, setSettings] = useState<EditorSettings>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {
      // The choice still applies to this page view.
    }
  }, [settings]);

  function update(change: Partial<EditorSettings>) {
    setSettings((current) => ({ ...current, ...change }));
  }

  return { settings, update };
}
