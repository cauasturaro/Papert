"use client";

import Link from "next/link";
import { FlameIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useEngagement } from "./use-engagement";
import { useTimeZoneDetection } from "./use-time-zone-detection";

/** Compact streak shown in the study navbar; opens the profile. Detects the zone in the IDE. */
export function StreakChip({ className }: { className?: string }) {
  const { engagement, reportDetectedTimeZone } = useEngagement();
  const streak = engagement.data?.streak;

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
    </Link>
  );
}
