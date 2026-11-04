import { z } from 'zod';
import { GENERATION_ATTEMPT_BUDGET } from '../../domain/quota.js';
import type { WorkerEvent } from '../../domain/execution.js';

export const workerEvent: z.ZodType<WorkerEvent> = z
  .object({
    version: z.literal(1),
    executionId: z.string().uuid(),
    lease: z.string().uuid(),
    index: z.number().int().min(1).max(100),
    status: z.enum(['running', 'completed', 'failed']),
    text: z.string().max(4000),
    tokens: z.number().int().min(0).max(GENERATION_ATTEMPT_BUDGET),
    // Validated against the attempt by Core; malformed content is recorded, never trusted.
    evaluation: z.unknown().optional(),
    // Citations are re-authorized against live sources before they are stored.
    grounding: z.unknown().optional(),
    // Untrusted; Study validates it.
    roadmap: z.unknown().optional(),
  })
  .strict()
  .refine(
    (event) =>
      (event.evaluation === undefined &&
        event.grounding === undefined &&
        event.roadmap === undefined) ||
      event.status === 'completed',
  );
