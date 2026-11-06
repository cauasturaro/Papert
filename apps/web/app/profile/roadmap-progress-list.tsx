import Link from "next/link";
import { Badge } from "@/components/ui/badge/badge";
import { Card } from "@/components/ui/card/card";
import { Progress } from "@/components/ui/progress/progress";
import type { RoadmapProgress } from "./engagement-api";
import { progressLabel } from "./engagement-state";

function ProgressRow({ roadmap }: { roadmap: RoadmapProgress }) {
  const label = progressLabel(roadmap.completedSteps, roadmap.totalSteps);

  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/study?workspace=${roadmap.workspaceId}`}
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

export function RoadmapProgressList({
  roadmaps,
}: {
  roadmaps: RoadmapProgress[];
}) {
  return (
    <Card className="space-y-4 p-4 sm:p-6" aria-labelledby="progress-title">
      <h2 id="progress-title" className="text-sm font-medium">
        Roadmap progress
      </h2>

      {roadmaps.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Start a roadmap to follow its progress here.
        </p>
      )}

      {roadmaps.length > 0 && (
        <ul className="divide-y divide-border">
          {roadmaps.map((roadmap) => (
            <ProgressRow key={roadmap.workspaceId} roadmap={roadmap} />
          ))}
        </ul>
      )}
    </Card>
  );
}
