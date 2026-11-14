import { Card } from "@/components/ui/card/card";
import type { RoadmapProgress } from "./engagement-api";
import { ProgressRow } from "./progress-row";

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
