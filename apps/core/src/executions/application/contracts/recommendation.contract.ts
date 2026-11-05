import { z } from 'zod';
import type { RecommendationRequest } from '../../domain/recommendation.js';

// Wire format of a community check; the goal and level come from the draft, not the body.
export const recommendationRequest: z.ZodType<RecommendationRequest> = z
  .object({
    requestKey: z.string().uuid(),
    kind: z.literal('recommendation'),
  })
  .strict();

export function isRecommendationBody(body: unknown) {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).kind === 'recommendation'
  );
}
