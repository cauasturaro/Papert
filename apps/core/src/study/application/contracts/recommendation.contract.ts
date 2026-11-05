import { z } from 'zod';
import { MAX_RECOMMENDATIONS } from '../../domain/draft-recommendation.js';
import type {
  DraftRecommendation,
  RecommendationMatch,
} from '../../domain/draft-recommendation.js';

const matchSchema: z.ZodType<RecommendationMatch> = z
  .object({
    roadmapId: z.string().regex(/^[a-z0-9-]{1,100}$/),
    similarity: z.number().min(-1).max(1),
  })
  .strict();

// Seymour's untrusted result; Core keeps only matches it offered and that are still published.
const resultSchema = z
  .object({ matches: z.array(matchSchema).max(MAX_RECOMMENDATIONS) })
  .strict();

const storedSchema: z.ZodType<DraftRecommendation> = z
  .object({
    executionId: z.string().uuid(),
    status: z.enum(['searching', 'ready', 'failed']),
    matches: z.array(matchSchema).max(MAX_RECOMMENDATIONS),
    declined: z.boolean(),
  })
  .strict();

/** Null when the worker sent something that is not a recommendation result. */
export function parseRecommendationResult(value: unknown) {
  const parsed = resultSchema.safeParse(value);

  return parsed.success ? parsed.data.matches : null;
}

export function parseStoredRecommendation(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return storedSchema.parse(value);
}
