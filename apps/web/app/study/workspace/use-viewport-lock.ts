"use client";

import { useEffect } from "react";

/**
 * Study views fill the viewport and scroll inside their panels. Next keeps a route
 * mounted but hidden after navigating away, so the lock follows the effect lifecycle
 * instead of the DOM; hiding the route runs the cleanup.
 */
export function useViewportLock() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.viewportApp = "";

    return () => {
      delete root.dataset.viewportApp;
    };
  }, []);
}
