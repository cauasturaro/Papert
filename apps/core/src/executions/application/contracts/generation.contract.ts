import { z } from 'zod';
import type { GenerationRequest } from '../../domain/roadmaps/roadmap-drafts.js';

// Wire format of a generation request; the goal and level come from the draft, not the body.
export const generationRequest: z.ZodType<GenerationRequest> = z.strictObject({
  requestKey: z.guid(),
  kind: z.literal('generation'),
  effort: z.enum(['low', 'medium']).optional(),
});

export function isGenerationBody(body: unknown) {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).kind === 'generation'
  );
}
