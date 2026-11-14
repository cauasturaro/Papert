"use client";

import { useEffect, useState } from "react";

export function useNow(intervalMs: number | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (intervalMs === null) {
      return;
    }

    // Resume from the wall clock after an idle interval.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());

    const timer = setInterval(() => setNow(Date.now()), intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
