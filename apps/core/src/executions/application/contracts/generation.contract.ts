import { z } from 'zod';
import type { GenerationRequest } from '../../domain/roadmap-drafts.js';

// Wire format of a generation request; the goal and level come from the draft, not the body.
export const generationRequest: z.ZodType<GenerationRequest> = z
  .object({
    requestKey: z.string().uuid(),
    kind: z.literal('generation'),
    effort: z.enum(['low', 'medium']).optional(),
  })
  .strict();

export function isGenerationBody(body: unknown) {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).kind === 'generation'
  );
}
