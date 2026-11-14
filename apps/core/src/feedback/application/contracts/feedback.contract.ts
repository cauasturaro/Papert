import { z } from 'zod';
import { validate } from '../../../common/application/validation.js';
import { FEEDBACK_LIST_LIMIT, FeedbackError } from '../../domain/feedback.js';
import type { FeedbackInput } from '../../domain/feedback.js';

export const feedbackSchema: z.ZodType<FeedbackInput, unknown> = z.strictObject(
  {
    rating: z.enum(['up', 'down']),
    hallucination: z.boolean().default(false),
  },
);

// `?executions=<id>,<id>`: the answers currently on the learner's screen.
export const executionIdsSchema = z
  .string()
  .max(FEEDBACK_LIST_LIMIT * 37)
  .transform((value) => value.split(',').filter((id) => id !== ''))
  .pipe(z.array(z.guid()).max(FEEDBACK_LIST_LIMIT));

export function parse<T, Input = T>(
  schema: z.ZodType<T, Input>,
  value: unknown,
) {
  return validate(
    schema,
    value,
    () => new FeedbackError('invalid', 'Invalid feedback request.'),
  );
}
