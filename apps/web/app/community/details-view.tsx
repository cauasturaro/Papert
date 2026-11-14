"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LoadErrorAlert } from "@/components/app/load-error-alert";
import { FileIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card/card";
import { CardSkeleton } from "@/components/ui/card/card-skeleton";
import { levelLabel } from "@/lib/roadmap";
import { ActionError } from "./action-error";
import { getDetails } from "./community-api";
import { detailsKey } from "./community-keys";
import { DetailStep } from "./detail-step";
import { FavoriteButton } from "./favorite-button";
import { publishedDate } from "./format";
import { StartDialog } from "./start-dialog";
import { useCommunityActions } from "./use-community-actions";
import { VoteControl } from "./vote-control";

export function DetailsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading roadmap" className="space-y-4">
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}

/**
 * Everything a learner needs to decide whether to study a published roadmap. The ID is read
 * on the client, so the page renders this inside Suspense below its static back link.
 */
export function DetailsView() {
  const { id } = useParams<{ id: string }>();
  const actions = useCommunityActions();
  const [confirming, setConfirming] = useState(false);

  const details = useQuery({
    queryKey: detailsKey(id),
    queryFn: () => getDetails(id),
  });

  if (details.isPending) {
    return <DetailsLoading />;
  }

  if (details.error) {
    return (
      <LoadErrorAlert
        error={details.error}
        title="This roadmap is not available"
        onRetry={() => void details.refetch()}
      />
    );
  }

  const roadmap = details.data;
  const level = levelLabel(roadmap.level);
  const titles = new Map(roadmap.steps.map((step) => [step.id, step.title]));
  const starting = actions.isStarting(roadmap.id);

  // Resuming opens the existing workspace; a first start asks for confirmation.
  function startOrResume() {
    if (roadmap.started) {
      actions.start(roadmap.id);

      return;
    }

    actions.resetStart();
    setConfirming(true);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <h1 className="text-2xl leading-snug font-semibold tracking-tight">
            {roadmap.title}
          </h1>

          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              By{" "}
              <strong className="text-foreground">{roadmap.authorName}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>Published {publishedDate(roadmap.publishedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{roadmap.stepCount} steps</span>
            {level && <Badge variant="secondary">{level}</Badge>}
            {roadmap.started && <Badge variant="success">Started</Badge>}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <p>{roadmap.description}</p>
          <p className="text-sm text-muted-foreground">
            Starting gives you a private workspace with the starter files. Your
            files, sources and progress stay yours; the roadmap and its author
            never change.
          </p>
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <VoteControl
            title={roadmap.title}
            tally={roadmap}
            readOnly={roadmap.own}
            disabled={actions.isVoting(roadmap.id)}
            onVote={(value) => actions.vote(roadmap.id, value)}
          />

          <div className="flex flex-wrap gap-2">
            <FavoriteButton
              favorited={roadmap.favorited}
              disabled={actions.isSaving(roadmap.id)}
              onToggle={() => actions.save(roadmap.id, !roadmap.favorited)}
            />

            <Button
              loading={starting && !confirming}
              disabled={starting}
              onClick={startOrResume}
            >
              {roadmap.started ? "Resume studying" : "Start studying"}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <ActionError
        message={actions.error ?? (confirming ? null : actions.startError)}
      />

      <StartDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={roadmap.title}
        pending={starting}
        error={actions.startError}
        onConfirm={() => actions.start(roadmap.id)}
      />

      <section aria-labelledby="steps-title" className="space-y-3">
        <h2 id="steps-title" className="text-lg font-semibold">
          Steps
        </h2>

        <ol className="space-y-3">
          {roadmap.steps.map((step, index) => (
            <DetailStep
              key={step.id}
              step={step}
              index={index}
              titles={titles}
            />
          ))}
        </ol>
      </section>

      <section aria-labelledby="files-title" className="space-y-2">
        <h2 id="files-title" className="text-lg font-semibold">
          Starter files
        </h2>

        <ul className="space-y-1">
          {roadmap.starterFiles.map((path) => (
            <li
              key={path}
              className="flex items-center gap-2 font-mono text-xs"
            >
              <FileIcon className="size-4 text-muted-foreground" />
              {path}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
