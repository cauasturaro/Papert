"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import { UsersIcon } from "@/components/icons";
import { RoadmapCard } from "../../community/roadmap-card";
import {
  useCommunityActions,
  type CommunityActions,
} from "../../community/use-community-actions";
import type { useDraftRecommendation } from "./use-draft-recommendation";

type Recommendation = ReturnType<typeof useDraftRecommendation>;

const SEARCHING =
  "Seymour is looking for community roadmaps that already cover your goal…";

function Heading({ children }: { children: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-medium">
      <UsersIcon className="size-4 text-muted-foreground" />
      {children}
    </h3>
  );
}

/** What the live region says for each view; empty when an alert or button speaks instead. */
function statusText(recommendation: Recommendation) {
  switch (recommendation.view) {
    case "idle":
      // The check could not even start (quota, rate limit, network); the retry button shows.
      if (recommendation.checkError) {
        return "";
      }

      return SEARCHING;
    case "searching":
      return SEARCHING;
    case "none":
      return "No community roadmap covers this goal yet. Generate one made for you.";
    case "matches":
      return "These published roadmaps already cover your goal. Start one in your own workspace, or continue to generate a roadmap made for you.";
    case "declined":
      return "You chose to generate your own roadmap.";
    case "failed":
      return "";
  }
}

function CheckFailed({ recommendation }: { recommendation: Recommendation }) {
  return (
    <Alert role="alert">
      <AlertTitle>The community catalog could not be checked</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span>Try again, or continue without suggestions.</span>
        <Button
          size="sm"
          variant="outline"
          disabled={recommendation.checking}
          onClick={recommendation.check}
        >
          Try again
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={recommendation.declining}
          onClick={recommendation.decline}
        >
          Continue without suggestions
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function Matches({
  recommendation,
  actions,
}: {
  recommendation: Recommendation;
  actions: CommunityActions;
}) {
  return (
    <div className="space-y-3">
      <ul
        aria-label="Suggested community roadmaps"
        className="grid gap-3 xl:grid-cols-2"
      >
        {recommendation.cards.map((card) => (
          <li key={card.id}>
            <RoadmapCard card={card} actions={actions} />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
        <p className="flex-1 text-sm">
          None of these fit what you want to learn?
        </p>
        <Button
          variant="outline"
          disabled={recommendation.declining}
          onClick={recommendation.decline}
        >
          Continue to generate my own
        </Button>
      </div>
    </div>
  );
}

function ViewControls({
  recommendation,
  actions,
}: {
  recommendation: Recommendation;
  actions: CommunityActions;
}) {
  switch (recommendation.view) {
    case "idle":
      if (!recommendation.checkError) {
        return null;
      }

      return (
        <Button
          size="sm"
          variant="outline"
          disabled={recommendation.checking}
          onClick={recommendation.check}
        >
          Check the community catalog
        </Button>
      );
    case "failed":
      return <CheckFailed recommendation={recommendation} />;
    case "matches":
      return <Matches recommendation={recommendation} actions={actions} />;
    case "declined":
      return (
        <Button
          size="sm"
          variant="ghost"
          disabled={recommendation.checking}
          onClick={recommendation.check}
        >
          Check the community again
        </Button>
      );
    default:
      return null;
  }
}

/**
 * Before a paid generation, Seymour shows community roadmaps close to the goal. The learner
 * reuses one or continues; Core enforces the same choice.
 */
export function RecommendationPanel({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  const actions = useCommunityActions();
  const status = statusText(recommendation);
  const loadingCards =
    recommendation.view === "matches" && recommendation.cardsLoading;

  const errors = [
    recommendation.checkError,
    recommendation.declineError,
    recommendation.cardsError,
    actions.error,
  ].filter(Boolean);

  return (
    <section aria-label="Community suggestions" className="space-y-3">
      <Heading>From the community</Heading>

      {/* One region for the whole check, so each change of view is announced once. */}
      <div
        role="status"
        aria-live="polite"
        className="space-y-1 text-sm text-muted-foreground empty:hidden"
      >
        {status && <p>{status}</p>}
        {loadingCards && <p>Loading suggestions…</p>}
      </div>

      <ViewControls recommendation={recommendation} actions={actions} />

      {errors.length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          {errors[0]}
        </p>
      )}
    </section>
  );
}
