import Link from "next/link";
import { AwardIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge/badge";
import type { Achievement } from "./engagement-api";
import { awardedLabel } from "./engagement-state";

/** One roadmap-completion badge; used on the profile and under a completed roadmap. */
export function AchievementBadge({
  achievement,
  showWorkspaceLink = true,
}: {
  achievement: Achievement;
  showWorkspaceLink?: boolean;
}) {
  return (
    <article
      aria-label={`Achievement: ${achievement.title} completed`}
      className="flex gap-3 rounded-lg border border-ring/40 bg-primary/10 p-3"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <AwardIcon className="size-5" />
      </span>

      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Roadmap completed
        </p>
        <h3 className="font-semibold">{achievement.title}</h3>
        <p className="text-xs text-muted-foreground">
          {achievement.stepCount} steps approved · Awarded{" "}
          <time dateTime={achievement.awardedAt}>
            {awardedLabel(achievement)}
          </time>
        </p>

        {achievement.concepts.length > 0 && (
          <ul aria-label="Concepts practiced" className="flex flex-wrap gap-1">
            {achievement.concepts.map((concept) => (
              <li key={concept}>
                <Badge size="sm" variant="outline">
                  {concept}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {showWorkspaceLink && (
          <Link
            href={`/study?workspace=${achievement.workspaceId}`}
            className="inline-block text-xs text-foreground underline underline-offset-4 hover:text-ring"
          >
            Open the workspace
          </Link>
        )}
      </div>
    </article>
  );
}
