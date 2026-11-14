import Link from "next/link";
import { AwardIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button/button";
import { Card } from "@/components/ui/card/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import { AchievementBadge } from "./achievement-badge";
import type { Achievement } from "./engagement-api";
import { ACHIEVEMENT_MEANING } from "./engagement-state";

export function AchievementList({
  achievements,
}: {
  achievements: Achievement[];
}) {
  return (
    <Card className="space-y-4 p-4 sm:p-6" aria-labelledby="achievements-title">
      <div className="space-y-1">
        <h2 id="achievements-title" className="text-sm font-medium">
          Achievements
          {achievements.length > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · {achievements.length}
            </span>
          )}
        </h2>
        <p className="text-xs text-muted-foreground">{ACHIEVEMENT_MEANING}</p>
      </div>

      {achievements.length === 0 && (
        <EmptyState size="sm">
          <EmptyStateIcon>
            <AwardIcon />
          </EmptyStateIcon>
          <EmptyStateTitle>No achievements yet</EmptyStateTitle>
          <EmptyStateDescription>
            Get every step of a roadmap approved to earn its badge.
          </EmptyStateDescription>
          <EmptyStateActions>
            <Link
              href="/study"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Open your study space
            </Link>
          </EmptyStateActions>
        </EmptyState>
      )}

      {achievements.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {achievements.map((achievement) => (
            <li key={achievement.roadmapId}>
              <AchievementBadge achievement={achievement} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
