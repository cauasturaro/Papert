"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlameIcon } from "@/components/icons";
import { announce } from "@/lib/a11y/announcer";
import { cn } from "@/lib/utils";
import { useEngagement } from "./use-engagement";
import { useTimeZoneDetection } from "./use-time-zone-detection";

const CELEBRATION_MS = 5000;

/** True for a few seconds after the streak grows during this visit. */
function useStreakIncrease(current: number | undefined) {
  const [lastSeen, setLastSeen] = useState<number | undefined>(current);
  const [increased, setIncreased] = useState(false);

  // Compared while rendering, so the first load never counts as an increase.
  if (current !== lastSeen) {
    setLastSeen(current);

    if (lastSeen !== undefined && current !== undefined && current > lastSeen) {
      setIncreased(true);
    }
  }

  useEffect(() => {
    if (!increased || current === undefined) {
      return;
    }

    announce(
      `Study streak: ${current} ${current === 1 ? "day" : "days"} in a row.`,
    );

    const timer = window.setTimeout(() => setIncreased(false), CELEBRATION_MS);

    return () => window.clearTimeout(timer);
  }, [increased, current]);

  return increased;
}

/** Compact streak shown in the study navbar; opens the profile. Detects the zone in the IDE. */
export function StreakChip({ className }: { className?: string }) {
  const { engagement, reportDetectedTimeZone } = useEngagement();
  const streak = engagement.data?.streak;
  const increased = useStreakIncrease(streak?.current);

  useTimeZoneDetection(engagement.data, reportDetectedTimeZone);

  if (!streak) {
    return null;
  }

  const days = streak.current === 1 ? "1 day" : `${streak.current} days`;
  const studiedToday = streak.status === "studied";

  return (
    <Link
      href="/profile"
      aria-label={`Study streak: ${days}${studiedToday ? ", studied today" : ""}. Open your progress.`}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors hover:bg-accent",
        studiedToday
          ? "border-ring/50 bg-primary/15 text-foreground"
          : "border-border text-muted-foreground",
        className,
      )}
    >
      <FlameIcon className={cn("size-3.5", studiedToday && "text-ring")} />
      {streak.current}

      {increased && (
        <span
          aria-hidden="true"
          className="text-ring motion-safe:animate-pulse"
        >
          +1
        </span>
      )}
    </Link>
  );
}
