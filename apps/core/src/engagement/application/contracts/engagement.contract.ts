import { z } from 'zod';
import { validate } from '../../../common/application/validation.js';
import { isTimeZone } from '../../domain/calendar.js';
import { EngagementError } from '../../domain/engagement.js';
import type { TimeZoneInput } from '../../domain/profile.js';

export const timeZoneSchema: z.ZodType<TimeZoneInput, unknown> = z.strictObject(
  {
    timeZone: z.string().refine(isTimeZone),
    // True when the browser reported it rather than the learner choosing it.
    detected: z.boolean().default(false),
  },
);

export function parse<T, Input = T>(
  schema: z.ZodType<T, Input>,
  value: unknown,
) {
  return validate(
    schema,
    value,
    () => new EngagementError('invalid', 'Choose a valid time zone.'),
  );
}
