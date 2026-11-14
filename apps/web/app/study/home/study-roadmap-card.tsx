"use client";

import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card/card";
import { formatRelativeTime } from "@/lib/format/time";
import { levelLabel } from "@/lib/roadmap";
import { PublishAction } from "../../community/publish-action";
import { RoadmapSteps } from "../challenge/roadmap-steps";
import { type StudyableRoadmap } from "../generation/drafts-api";
import { StartError } from "./study-home-sections";

export function StudyRoadmapCard({
  item,
  starting,
  error,
  onStart,
}: {
  item: StudyableRoadmap;
  starting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const { roadmap, workspace } = item;
  const generated = roadmap.authorUserId !== null;
  const level = levelLabel(roadmap.definition.level);
  const lastActivityAt = workspace?.lastActivityAt ?? null;

  return (
    <Card role="region" aria-label={roadmap.definition.title}>
      <CardHeader>
        <CardTitle as="h3" className="text-xl">
          {roadmap.definition.title}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          {generated ? (
            <span>Generated for you</span>
          ) : (
            <span>
              Created by <strong>{roadmap.authorName}</strong>
            </span>
          )}
          {level && <Badge variant="secondary">{level}</Badge>}
          {lastActivityAt && (
            <span>Last studied {formatRelativeTime(lastActivityAt)}</span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <p>{roadmap.definition.description}</p>
        <RoadmapSteps
          roadmap={roadmap}
          currentStep={workspace?.currentStep ?? 0}
        />
      </CardContent>

      <CardFooter className="flex flex-col items-stretch gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button loading={starting} onClick={onStart}>
            {workspace ? "Resume studying" : "Start studying"}
          </Button>

          {generated && (
            <PublishAction
              roadmap={{ id: roadmap.id, title: roadmap.definition.title }}
            />
          )}
        </div>

        {error && <StartError message={error} />}
      </CardFooter>
    </Card>
  );
}
