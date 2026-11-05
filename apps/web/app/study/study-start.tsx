"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge/badge";
import { Button, buttonVariants } from "@/components/ui/button/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card/card";
import { SparklesIcon } from "@/components/icons";
import { levelLabel } from "@/lib/roadmap";
import { cn } from "@/lib/utils";
import { PublishAction } from "../community/publish-action";
import { Discover, NoRoadmaps } from "./study-home-sections";
import { RoadmapSteps } from "./challenge/roadmap-steps";
import {
  listDrafts,
  listRoadmaps,
  type StudyableRoadmap,
} from "./generation/drafts-api";
import { StudyRequestError } from "./study-api";
import type { useStudy } from "./use-study";

const DRAFT_STATUS: Record<string, string> = {
  open: "Ready to generate",
  generating: "Generating…",
  failed: "Generation failed",
};

function StudyRoadmapCard({
  item,
  busy,
  onStart,
}: {
  item: StudyableRoadmap;
  busy: boolean;
  onStart: () => void;
}) {
  const { roadmap, workspace } = item;
  const generated = roadmap.authorUserId !== null;
  const level = levelLabel(roadmap.definition.level);

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
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <p>{roadmap.definition.description}</p>
        <RoadmapSteps
          roadmap={roadmap}
          currentStep={workspace?.currentStep ?? 0}
        />
      </CardContent>

      <CardFooter className="flex flex-wrap items-center gap-3">
        <Button onClick={onStart} disabled={busy}>
          {workspace ? "Resume studying" : "Start studying"}
        </Button>

        {generated && (
          <PublishAction
            roadmap={{ id: roadmap.id, title: roadmap.definition.title }}
          />
        )}
      </CardFooter>
    </Card>
  );
}

/** Study home: roadmaps to start or resume, drafts in preparation and roadmap creation. */
export function StudyStart({
  study,
  onCreate,
  onOpenDraft,
}: {
  study: ReturnType<typeof useStudy>;
  onCreate: () => void;
  onOpenDraft: (workspaceId: string) => void;
}) {
  const roadmaps = useQuery({
    queryKey: ["roadmaps"],
    queryFn: listRoadmaps,
    retry: false,
  });
  const drafts = useQuery({
    queryKey: ["drafts"],
    queryFn: listDrafts,
    retry: false,
  });

  const signedOut =
    study.signedOut ||
    (roadmaps.error instanceof StudyRequestError &&
      roadmaps.error.status === 401);
  const busy = study.busy || roadmaps.isPending;
  const message = study.message || roadmaps.error?.message || "";

  return (
    <main className="flex flex-1 justify-center overflow-auto bg-muted/40 p-4 sm:p-6">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Your study space</h1>

          {!signedOut && (
            <Button onClick={onCreate}>
              <SparklesIcon />
              Create a roadmap
            </Button>
          )}
        </div>

        <p
          role="status"
          aria-live="polite"
          className="text-center text-sm text-muted-foreground"
        >
          {busy ? "Please wait…" : message}
        </p>

        {signedOut && !busy && (
          <Link href="/account" className={cn(buttonVariants(), "mx-auto")}>
            Go to sign in
          </Link>
        )}

        {!signedOut && roadmaps.error && !busy && (
          <Button className="mx-auto" onClick={() => void roadmaps.refetch()}>
            Retry loading study
          </Button>
        )}

        {drafts.data && drafts.data.length > 0 && (
          <section aria-label="Roadmaps in preparation" className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              In preparation
            </h2>

            <ul className="space-y-2">
              {drafts.data.map((draft) => (
                <li
                  key={draft.workspaceId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate">{draft.goal}</p>
                    <Badge
                      size="sm"
                      variant={
                        draft.status === "failed" ? "destructive" : "secondary"
                      }
                    >
                      {DRAFT_STATUS[draft.status] ?? draft.status}
                    </Badge>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => onOpenDraft(draft.workspaceId)}
                  >
                    Continue
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!signedOut && <Discover />}

        {roadmaps.data && roadmaps.data.length === 0 && (
          <NoRoadmaps onCreate={onCreate} />
        )}

        {roadmaps.data && roadmaps.data.length > 0 && (
          <section aria-label="Your roadmaps" className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Your roadmaps
            </h2>

            {roadmaps.data.map((item) => (
              <StudyRoadmapCard
                key={item.roadmap.id}
                item={item}
                busy={study.busy}
                onStart={() => study.start(item.roadmap.id)}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
