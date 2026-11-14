"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/** A function whose identity never changes but always calls the latest version. */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
) {
  const latest = useRef(callback);

  useLayoutEffect(() => {
    latest.current = callback;
  });

  return useCallback((...args: Args) => latest.current(...args), []);
}
