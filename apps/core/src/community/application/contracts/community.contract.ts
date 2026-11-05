import { z } from 'zod';
import { validate } from '../../../common/application/validation.js';
import { CATALOG_MAX_PAGE, MAX_IDS } from '../../domain/catalog.js';
import { CommunityError } from '../../domain/community.js';
import type { CatalogQuery, VoteValue } from '../../domain/community.js';

export const roadmapIdSchema = z.string().regex(/^[a-z0-9-]{1,100}$/);

const levelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const catalogQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    level: levelSchema.optional(),
    sort: z.enum(['top', 'new']).default('top'),
    page: z.coerce.number().int().min(1).max(CATALOG_MAX_PAGE).default(1),
  })
  .strict()
  .transform((value): CatalogQuery => ({
    query: value.q ? value.q : null,
    level: value.level ?? null,
    sort: value.sort,
    page: value.page,
  }));

// Comma-separated roadmap IDs, e.g. recommendation matches; repeats count once.
export const idsSchema = z
  .string()
  .transform((value) => [...new Set(value.split(','))])
  .pipe(z.array(roadmapIdSchema).min(1).max(MAX_IDS));

export const publishSchema = z
  .object({
    authorName: z.string().trim(),
    // The learner confirmed what becomes public and that publication is permanent.
    acknowledged: z.literal(true),
  })
  .strict();

export const voteSchema: z.ZodType<{ value: VoteValue }> = z
  .object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) })
  .strict();

export const emptyBodySchema = z.object({}).strict();

export function parse<T, Input>(
  schema: z.ZodType<T, z.ZodTypeDef, Input>,
  value: unknown,
): T {
  return validate(
    schema,
    value,
    () =>
      new CommunityError(
        'invalid',
        'Invalid community request. Check the fields and limits.',
      ),
  );
}
