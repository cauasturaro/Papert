import type { RecommendationCandidate } from '../recommendation.js';

/** Published roadmaps; provided by the community module. */
export interface RecommendationCatalog {
  // Best-ranked roadmaps the user did not publish, as public text only.
  candidates(userId: string): Promise<RecommendationCandidate[]>;
  // Which of these IDs are published now.
  publishedIds(roadmapIds: string[]): Promise<string[]>;
}
