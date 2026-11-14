"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  applyTheme,
  readPreference,
  resolveTheme,
  storePreference,
  subscribeToSystemTheme,
  themeChangeEvent,
  themeStorageKey,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === themeStorageKey) {
      listener();
    }
  };

  window.addEventListener(themeChangeEvent, listener);
  window.addEventListener("storage", onStorage);
  const unsubscribeSystem = subscribeToSystemTheme(listener);

  return () => {
    window.removeEventListener(themeChangeEvent, listener);
    window.removeEventListener("storage", onStorage);
    unsubscribeSystem();
  };
}

// The server cannot know the stored choice; the head script already painted it.
const serverPreference = (): ThemePreference => "system";
const serverTheme = (): ResolvedTheme => "light";

export function useTheme() {
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    serverPreference,
  );
  const resolved = useSyncExternalStore(
    subscribe,
    () => resolveTheme(readPreference()),
    serverTheme,
  );

  // Keeps <html data-theme> current when the system scheme or another tab changes.
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    storePreference(next);
    applyTheme(resolveTheme(next));

    window.dispatchEvent(new Event(themeChangeEvent));
  }, []);

  return { preference, resolved, setPreference };
}
