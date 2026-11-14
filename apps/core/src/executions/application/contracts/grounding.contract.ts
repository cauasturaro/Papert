import { z } from 'zod';
import { citationLocation as location } from '../../../common/application/contracts/citation-location.contract.js';
import type { Grounding } from '../../domain/tutor/grounding.js';

// Wire format Seymour reports on a completed tutor event.
const groundingSchema = z.strictObject({
  support: z.enum(['cited', 'unsupported']),
  citations: z
    .array(
      z.strictObject({
        sourceId: z.guid(),
        cite: z.string().min(1).max(400),
        location,
        excerpt: z.string().max(2000),
        quote: z.string().max(1500).nullable(),
      }),
    )
    .max(5),
});

/** Malformed grounding is dropped rather than failing the answer it came with. */
export function parseGrounding(value: unknown): Grounding | null {
  const parsed = groundingSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}
