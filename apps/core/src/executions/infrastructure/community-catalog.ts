import type { CommunityService } from '../../community/application/community.service.js';
import type { RecommendationCatalog } from '../domain/ports/recommendation-catalog.js';

/** Reads the catalog through the community module's public service, never its tables. */
export class CommunityRecommendationCatalog implements RecommendationCatalog {
  constructor(private readonly community: CommunityService) {}

  candidates(userId: string) {
    return this.community.recommendationCandidates(userId);
  }

  publishedIds(roadmapIds: string[]) {
    return this.community.publishedIds(roadmapIds);
  }
}
