"use client";

import Link from "next/link";
import { AchievementBadge } from "./achievement-badge";
import { achievementFor } from "./engagement-state";
import { useEngagement } from "./use-engagement";

/** The badge of a completed roadmap, from the same data as the profile. */
export function CompletionAchievement({ roadmapId }: { roadmapId: string }) {
  const { engagement } = useEngagement();

  if (!engagement.data) {
    return null;
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
      <Link
        href="/profile"
        className="inline-block text-xs underline underline-offset-4 hover:text-ring"
      >
        See all your achievements
      </Link>
    </div>
  );
}
