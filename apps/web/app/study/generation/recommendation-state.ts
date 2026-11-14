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

/**
 * Words for the cosine similarity Seymour reports; matches start at 0.35, so even the
 * lowest band is related to the goal.
 */
export function similarityLabel(similarity: number) {
  if (similarity >= 0.65) {
    return "Very similar to your goal";
  }

  if (similarity >= 0.5) {
    return "Similar to your goal";
  }

  return "Related to your goal";
}
