import { z } from 'zod';
import { validate } from '../../../common/application/validation.js';
import { ExecutionError } from '../../domain/execution.js';
import type { ExecutionRequest } from '../../domain/execution.js';

export const executionRequest: z.ZodType<ExecutionRequest> = z
  .strictObject({
    requestKey: z.guid(),
    revision: z.number().refine(Number.isInteger).nonnegative(),
    kind: z.enum(['chat', 'analysis']),
    prompt: z.string().trim().min(1).max(2000).optional(),
    mode: z.enum(['doubt', 'teaching', 'solution', 'review']).optional(),
    effort: z.enum(['low', 'medium', 'high']).optional(),
    activeFile: z.string().min(1).max(200).optional(),
    selection: z
      .strictObject({
        start: z.number().refine(Number.isInteger).nonnegative(),
        end: z.number().refine(Number.isInteger).nonnegative(),
      })
      .optional(),
    // Sources the learner mentioned with @; Core checks they are ready in this workspace.
    sourceIds: z.array(z.guid()).max(5).optional(),
    // The tutor conversation to continue; Core uses the most recent one when absent.
    conversationId: z.guid().optional(),
  })
  .refine((input) => !input.mode || input.kind === 'chat')
  .refine((input) => !input.sourceIds || !!input.mode)
  .refine((input) => !input.conversationId || !!input.mode)
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

// `?conversation=<id>` on a workspace's execution list.
export const conversationFilter = z.guid().optional();

// `?before=<execution id>` pages a conversation's transcript back in time.
export const beforeCursor = z.guid().optional();

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
