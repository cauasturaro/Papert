"use client";

import { useState, useSyncExternalStore } from "react";
import { useNow } from "../use-now";

function subscribeToPointer(onChange: () => void) {
  const query = window.matchMedia("(pointer: coarse)");

  query.addEventListener("change", onChange);

  return () => {
    query.removeEventListener("change", onChange);
  };
}

/** Touch keyboards have no Shift+Enter, so Enter adds a line there and the button sends. */
export function useCoarsePointer() {
  return useSyncExternalStore(
    subscribeToPointer,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

/** Whole seconds left until `until`, refreshed every second while positive. */
export function useCountdown(until: number | null) {
  const [expiredUntil, setExpiredUntil] = useState<number | null>(null);
  const now = useNow(until !== null && until !== expiredUntil ? 1000 : null);

  if (until !== null && until <= now && expiredUntil !== until) {
    setExpiredUntil(until);
  }

  if (until === null) {
    return 0;
  }

  return Math.max(0, until - now);
}
