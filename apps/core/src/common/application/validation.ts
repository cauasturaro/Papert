import type { z } from 'zod';

/** Parses untrusted input; each module supplies its own error for invalid data. */
export function validate<T>(
  schema: z.ZodType<T>,
  value: unknown,
  invalid: () => Error,
): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw invalid();
  }

  return result.data;
}
