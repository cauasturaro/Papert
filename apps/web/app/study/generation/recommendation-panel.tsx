"use client";

import { UsersIcon } from "@/components/icons";
import { ViewControls } from "./recommendation-controls";
import { useCommunityActions } from "../../community/use-community-actions";
import type { useDraftRecommendation } from "./use-draft-recommendation";

export type Recommendation = ReturnType<typeof useDraftRecommendation>;

const SEARCHING =
  "Seymour is looking for community roadmaps that already cover your goal…";

function Heading({ children }: { children: string }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-medium">
      <UsersIcon className="size-4 text-muted-foreground" />
      {children}
    </h2>
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
