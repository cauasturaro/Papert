import { z } from 'zod';
import { citationLocation as location } from '../../../common/application/contracts/citation-location.contract.js';
import type { Grounding } from '../../domain/grounding.js';

// Wire format Seymour reports on a completed tutor event.
const groundingSchema = z
  .object({
    support: z.enum(['cited', 'unsupported']),
    citations: z
      .array(
        z
          .object({
            sourceId: z.string().uuid(),
            cite: z.string().min(1).max(400),
            location,
            excerpt: z.string().max(2000),
            quote: z.string().max(1500).nullable(),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

/** Malformed grounding is dropped rather than failing the answer it came with. */
export function parseGrounding(value: unknown): Grounding | null {
  const parsed = groundingSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}
