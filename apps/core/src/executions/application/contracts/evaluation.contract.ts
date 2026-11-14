import { z } from 'zod';
import type { Evaluation } from '../../domain/analysis/evaluation.js';

export const evaluationSchema: z.ZodType<Evaluation> = z.strictObject({
  attemptId: z.guid(),
  revision: z.number().refine(Number.isInteger).nonnegative(),
  stepId: z.string().min(1).max(100),
  summary: z.string().min(1).max(800),
  criteria: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(200),
        status: z.enum(['met', 'not_met']),
        feedback: z.string().min(1).max(600),
      }),
    )
    .min(1)
    .max(20),
  findings: z
    .array(
      z.strictObject({
        category: z.enum(['logic', 'contract', 'structure', 'security']),
        severity: z.enum(['info', 'warning', 'error']),
        path: z.string().max(200).nullable(),
        // Absent in evaluations recorded before Seymour reported lines.
        line: z.number().int().min(1).max(100000).nullable().optional(),
        message: z.string().min(1).max(400),
      }),
    )
    .max(10),
  hints: z.array(z.string().min(1).max(300)).min(1).max(3),
});

export function parseEvaluation(value: unknown): Evaluation | null {
  const parsed = evaluationSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}
