import { z } from 'zod';
import type { Evaluation } from '../../domain/evaluation.js';

export const evaluationSchema: z.ZodType<Evaluation> = z
  .object({
    attemptId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    stepId: z.string().min(1).max(100),
    summary: z.string().min(1).max(800),
    criteria: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            status: z.enum(['met', 'not_met']),
            feedback: z.string().min(1).max(600),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    findings: z
      .array(
        z
          .object({
            category: z.enum(['logic', 'contract', 'structure', 'security']),
            severity: z.enum(['info', 'warning', 'error']),
            path: z.string().max(200).nullable(),
            message: z.string().min(1).max(400),
          })
          .strict(),
      )
      .max(10),
    hints: z.array(z.string().min(1).max(300)).min(1).max(3),
  })
  .strict();

export function parseEvaluation(value: unknown): Evaluation | null {
  const parsed = evaluationSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}
