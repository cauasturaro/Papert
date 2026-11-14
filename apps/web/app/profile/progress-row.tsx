"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge/badge";
import { buttonVariants } from "@/components/ui/button/button";
import { Progress } from "@/components/ui/progress/progress";
import type { RoadmapProgress } from "./engagement-api";
import { progressLabel } from "./engagement-state";

export function ProgressRow({ roadmap }: { roadmap: RoadmapProgress }) {
  const label = progressLabel(roadmap.completedSteps, roadmap.totalSteps);
  const href = `/study/${roadmap.workspaceId}`;

  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={href}
          className="min-w-0 font-medium underline-offset-4 hover:underline"
        >
          {roadmap.title}
        </Link>

        {roadmap.achieved && (
          <Badge size="sm" variant="success">
            Achievement earned
          </Badge>
        )}
        {roadmap.completed && !roadmap.achieved && (
          <Badge size="sm" variant="secondary">
            Completed
          </Badge>
        )}

        {!roadmap.completed && (
          <Link
            href={href}
            className={buttonVariants({ size: "sm", variant: "outline" })}
            aria-label={`Continue ${roadmap.title}`}
          >
            Continue
          </Link>
        )}
      </div>

      <Progress
        size="sm"
        max={roadmap.totalSteps}
        value={Math.min(roadmap.completedSteps, roadmap.totalSteps)}
        aria-label={`${roadmap.title}: ${label}`}
      />
      <p className="text-xs text-muted-foreground">{label}</p>
    </li>
  );
}
