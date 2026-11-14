import { z } from 'zod';
import type { CitationLocation } from '../../domain/citation-location.js';

const heading = z.string().max(300).nullable().optional();
// Markdown chunks carry their heading path.
const headings = z.array(z.string().max(300)).max(10).optional();

// Integer refinements preserve the wire contract beyond JavaScript's safe integer range.
/** Where a cited chunk sits in its source: a PDF page, MD lines or DOC/DOCX paragraphs. */
export const citationLocation = z.union([
  z.strictObject({ page: z.number().refine(Number.isInteger).positive() }),
  z.strictObject({
    lineStart: z.number().refine(Number.isInteger).positive(),
    lineEnd: z.number().refine(Number.isInteger).positive(),
    headings,
  }),
  z.strictObject({
    paragraphStart: z.number().refine(Number.isInteger).positive(),
    paragraphEnd: z.number().refine(Number.isInteger).positive(),
    heading,
  }),
]);

// Exact type equality, so an extra or changed field on either side fails tsc.
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

true satisfies Same<CitationLocation, z.infer<typeof citationLocation>>;
