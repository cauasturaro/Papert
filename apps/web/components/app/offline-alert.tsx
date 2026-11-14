"use client";

import { useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert/alert";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);

  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** A small notice while the browser reports no connection. */
export function OfflineAlert() {
  const offline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );

  if (!offline) {
    return null;
  }

  return (
    <Alert variant="warning" size="sm" role="status">
      <AlertDescription>
        You are offline. Papert will load and save again once your connection is
        back.
      </AlertDescription>
    </Alert>
  );
}
