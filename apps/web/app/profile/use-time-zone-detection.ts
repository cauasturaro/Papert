"use client";

import { useEffect, useRef } from "react";
import type { Engagement } from "./engagement-api";
import { zoneToDetect } from "./engagement-state";

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Sends the browser's zone once while the profile has none, so later study days are dated where the
 * learner is. Call it from one component per page.
 */
export function useTimeZoneDetection(
  engagement: Engagement | undefined,
  report: (zone: string) => void,
) {
  const sent = useRef(false);
  const detected = zoneToDetect(engagement, browserTimeZone());

  useEffect(() => {
    if (!detected || sent.current) {
      return;
    }

    sent.current = true;
    report(detected);
  }, [detected, report]);
}
