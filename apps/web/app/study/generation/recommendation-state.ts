import type { DraftRecommendation, DraftStatus } from "./drafts-api.ts";

type RecommendationView =
  "idle" | "searching" | "matches" | "none" | "failed" | "declined";

/** What the draft page shows for the community check. */
export function recommendationView(
  recommendation: DraftRecommendation | null,
): RecommendationView {
  if (!recommendation) {
    return "idle";
  }

  if (recommendation.status === "searching") {
    return "searching";
  }

  if (recommendation.declined) {
    return "declined";
  }

  if (recommendation.status === "failed") {
    return "failed";
  }

  return recommendation.matches.length > 0 ? "matches" : "none";
}

/** A draft that can still be generated runs its check once, on arrival. */
export function shouldCheck(
  status: DraftStatus,
  recommendation: DraftRecommendation | null,
) {
  return recommendation === null && (status === "open" || status === "failed");
}
