"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button/button";
import { AchievementBadge } from "./achievement-badge";
import { achievementFor } from "./engagement-state";
import { useEngagement } from "./use-engagement";

/** The badge of a completed roadmap, from the same data as the profile. */
export function CompletionAchievement({ roadmapId }: { roadmapId: string }) {
  const { engagement } = useEngagement();

  if (engagement.isPending) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Loading your achievement…
      </p>
    );
  }

  if (!engagement.data) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Your achievement could not load.</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void engagement.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  const achievement = achievementFor(engagement.data, roadmapId);

  if (!achievement) {
    return (
      <p className="text-xs text-muted-foreground">
        This roadmap was completed before Papert recorded achievements, so it
        has no badge.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <AchievementBadge achievement={achievement} showWorkspaceLink={false} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Link
          href="/profile"
          className="underline underline-offset-4 hover:text-ring"
        >
          See all your achievements
        </Link>
        <Link
          href="/study"
          className="underline underline-offset-4 hover:text-ring"
        >
          Choose what to study next
        </Link>
      </div>
    </div>
  );
}
