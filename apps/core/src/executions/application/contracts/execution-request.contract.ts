import { z } from 'zod';
import { validate } from '../../../common/application/validation.js';
import { ExecutionError } from '../../domain/execution.js';
import type { ExecutionRequest } from '../../domain/execution.js';

export const executionRequest: z.ZodType<ExecutionRequest> = z
  .object({
    requestKey: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    kind: z.enum(['chat', 'analysis']),
    prompt: z.string().trim().min(1).max(2000).optional(),
    mode: z.enum(['doubt', 'teaching', 'solution', 'review']).optional(),
    effort: z.enum(['low', 'medium', 'high']).optional(),
    activeFile: z.string().min(1).max(200).optional(),
    selection: z
      .object({
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    // Sources the learner mentioned with @; Core checks they are ready in this workspace.
    sourceIds: z.array(z.string().uuid()).max(5).optional(),
  })
  .strict()
  .refine((input) => !input.mode || input.kind === 'chat')
  .refine((input) => !input.sourceIds || !!input.mode)
  .refine((input) => input.kind === 'analysis' || !!input.prompt)
  // Analysis evaluates the saved attempt; it accepts no free-form instructions.
  .refine(
    (input) =>
      input.kind === 'chat' ||
      (!input.prompt && !input.activeFile && !input.selection),
  )
  .refine(
    (input) =>
      input.kind === 'analysis' ||
      input.mode ||
      (!input.effort && !input.activeFile && !input.selection),
  );

// Same response body executions have always returned for invalid input.
export function parse<T>(schema: z.ZodType<T>, body: unknown) {
  return validate(
    schema,
    body,
    () =>
      new ExecutionError(
        'invalid',
        'Invalid study request. Check the fields and limits.',
      ),
  );
}
