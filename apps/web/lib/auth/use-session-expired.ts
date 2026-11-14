"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  dismissSessionExpired,
  isSessionExpired,
  signInHref,
  subscribeToSessionExpiry,
} from "./session-signal";

/**
 * Whether the signed-in session ended during this visit, plus the sign-in link that
 * returns here. Rendering the notice is up to the caller.
 */
export function useSessionExpired() {
  const pathname = usePathname();

  const expired = useSyncExternalStore(
    subscribeToSessionExpiry,
    isSessionExpired,
    () => false,
  );

  // Only read on the client: `expired` is always false while server rendering.
  const search = expired ? window.location.search : "";

  return {
    expired,
    signInHref: signInHref(`${pathname}${search}`),
    dismiss: dismissSessionExpired,
  };
}
