"use client";

import Link from "next/link";
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
import { levelLabel } from "@/lib/roadmap";
import type { CatalogCard } from "./community-api";
import { FavoriteButton } from "./favorite-button";
import type { CommunityActions } from "./use-community-actions";
import { VoteControl } from "./vote-control";

/** A catalog entry: what it teaches, who wrote it, community votes and the learner's actions. */
export function RoadmapCard({
  card,
  actions,
}: {
  card: CatalogCard;
  actions: CommunityActions;
}) {
  const level = levelLabel(card.level);

  return (
    <Card role="article" aria-label={card.title} className="h-full">
      <CardHeader>
        <CardTitle as="h3" className="text-lg leading-snug">
          <Link href={`/community/${card.id}`} className="hover:underline">
            {card.title}
          </Link>
        </CardTitle>

        <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            By <strong className="text-foreground">{card.authorName}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>{card.stepCount} steps</span>
          {level && <Badge variant="secondary">{level}</Badge>}
          {card.started && <Badge variant="success">Started</Badge>}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="line-clamp-3 text-sm">{card.description}</p>

        {card.concepts.length > 0 && (
          <ul aria-label="Concepts" className="flex flex-wrap gap-1.5">
            {card.concepts.map((concept) => (
              <li key={concept}>
                <Badge variant="outline" size="sm">
                  {concept}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        <VoteControl
          title={card.title}
          tally={card}
          readOnly={card.own}
          disabled={actions.isVoting(card.id)}
          onVote={(value) => actions.vote(card.id, value)}
        />

        <div className="flex flex-wrap gap-2">
          <FavoriteButton
            favorited={card.favorited}
            disabled={actions.isSaving(card.id)}
            onToggle={() => actions.save(card.id, !card.favorited)}
          />

          <Button
            size="sm"
            disabled={actions.isStarting(card.id)}
            onClick={() => actions.start(card.id)}
          >
            {card.started ? "Resume studying" : "Start studying"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
