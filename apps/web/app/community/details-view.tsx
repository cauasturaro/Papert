"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card/card";
import { FileIcon } from "@/components/icons";
import { levelLabel } from "@/lib/roadmap";
import { getDetails, type CatalogDetails } from "./community-api";
import { detailsKey } from "./community-keys";
import { FavoriteButton } from "./favorite-button";
import { publishedDate } from "./format";
import { LoadErrorAlert } from "./load-error-alert";
import { useCommunityActions } from "./use-community-actions";
import { VoteControl } from "./vote-control";

type Step = CatalogDetails["steps"][number];

function DetailStep({
  step,
  index,
  titles,
}: {
  step: Step;
  index: number;
  titles: Map<string, string>;
}) {
  const prerequisites = step.requires.map((id) => titles.get(id) ?? id);

  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Step {index + 1}
        </p>
        <h3 className="text-base font-semibold">{step.title}</h3>
      </div>

      {step.concepts.length > 0 && (
        <ul aria-label="Concepts" className="flex flex-wrap gap-1.5">
          {step.concepts.map((concept) => (
            <li key={concept}>
              <Badge variant="outline" size="sm">
                {concept}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {prerequisites.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Builds on: {prerequisites.join(", ")}
        </p>
      )}

      <p className="text-sm whitespace-pre-line">{step.content}</p>

      <div className="space-y-2 rounded-md bg-muted/60 p-3">
        <p className="text-sm font-medium">Challenge</p>
        <p className="text-sm whitespace-pre-line">
          {step.challenge.instructions}
        </p>

        <ul aria-label="Criteria" className="list-disc space-y-1 pl-5 text-sm">
          {step.challenge.criteria.map((criterion) => (
            <li key={criterion.id}>{criterion.description}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function DetailsLoading() {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      Loading roadmap…
    </p>
  );
}

/**
 * Everything a learner needs to decide whether to study a published roadmap. The ID is read
 * on the client, so the page renders this inside Suspense below its static back link.
 */
export function DetailsView() {
  const { id } = useParams<{ id: string }>();
  const actions = useCommunityActions();

  const details = useQuery({
    queryKey: detailsKey(id),
    queryFn: () => getDetails(id),
    retry: false,
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
              disabled={actions.isStarting(roadmap.id)}
              onClick={() => actions.start(roadmap.id)}
            >
              {roadmap.started ? "Resume studying" : "Start studying"}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {actions.error && (
        <p role="alert" className="text-sm text-destructive">
          {actions.error}
        </p>
      )}

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
