import { z } from 'zod';
import type { RecommendationRequest } from '../../domain/roadmaps/recommendation.js';

// Wire format of a community check; the goal and level come from the draft, not the body.
export const recommendationRequest: z.ZodType<RecommendationRequest> =
  z.strictObject({
    requestKey: z.guid(),
    kind: z.literal('recommendation'),
  });

export function isRecommendationBody(body: unknown) {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).kind === 'recommendation'
  );
}
