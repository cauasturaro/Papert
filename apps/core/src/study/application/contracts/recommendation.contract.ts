import { z } from 'zod';
import { MAX_RECOMMENDATIONS } from '../../domain/draft-recommendation.js';
import type {
  DraftRecommendation,
  RecommendationMatch,
} from '../../domain/draft-recommendation.js';

const matchSchema: z.ZodType<RecommendationMatch> = z.strictObject({
  roadmapId: z.string().regex(/^[a-z0-9-]{1,100}$/),
  similarity: z.number().min(-1).max(1),
});

// Seymour's untrusted result; Core keeps only matches it offered and that are still published.
const resultSchema = z.strictObject({
  matches: z.array(matchSchema).max(MAX_RECOMMENDATIONS),
});

const storedSchema: z.ZodType<DraftRecommendation> = z.strictObject({
  executionId: z.guid(),
  status: z.enum(['searching', 'ready', 'failed']),
  matches: z.array(matchSchema).max(MAX_RECOMMENDATIONS),
  declined: z.boolean(),
});

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
