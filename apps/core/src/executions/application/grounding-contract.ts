import { z } from 'zod';
import type { Grounding } from '../domain/grounding.js';

const heading = z.string().max(300).nullable().optional();
// Markdown chunks carry their heading path.
const headings = z.array(z.string().max(300)).max(10).optional();

const location = z.union([
  z.object({ page: z.number().int().positive() }).strict(),
  z
    .object({
      lineStart: z.number().int().positive(),
      lineEnd: z.number().int().positive(),
      headings,
    })
    .strict(),
  z
    .object({
      paragraphStart: z.number().int().positive(),
      paragraphEnd: z.number().int().positive(),
      heading,
    })
    .strict(),
]);

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
