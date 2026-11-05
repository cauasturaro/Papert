import { z } from 'zod';
import { validate } from '../../../common/application/validation.js';
import { MAX_TEXT } from '../../domain/memory-text.js';
import { MemoryError } from '../../domain/memory.js';
import type { MemoryKind, SummaryContent } from '../../domain/memory.js';

const kindSchema = z.enum(['preference', 'difficulty']);

// Length rules live in the domain; the wire format only bounds the payload.
const textSchema = z.string().max(MAX_TEXT * 2);

export const createItemSchema = z
  .object({ kind: kindSchema, text: textSchema })
  .strict();

export const updateItemSchema = z
  .object({ kind: kindSchema.optional(), text: textSchema.optional() })
  .strict()
  .refine((value) => value.kind !== undefined || value.text !== undefined);

export const emptyBodySchema = z.object({}).strict();

const summaryItem = z.string().trim().min(1).max(160);
const summaryItems = z.array(summaryItem).max(4);
// Pending actions get more room; Seymour applies the same limits before sending.
const pendingItems = z.array(summaryItem).max(6);

// Untrusted worker output: Seymour's summary of folded turns and an optional proposal.
const summarySchema: z.ZodType<SummaryContent> = z
  .object({
    covered: summaryItems,
    pending: pendingItems,
    struggles: summaryItems,
  })
  .strict();

const proposalSchema = z
  .object({ kind: kindSchema, text: z.string().max(MAX_TEXT) })
  .strict();

export const turnMemorySchema = z
  .object({
    summary: summarySchema.optional(),
    proposal: proposalSchema.optional(),
  })
  .strict();

export type TurnMemory = {
  summary?: SummaryContent;
  proposal?: { kind: MemoryKind; text: string };
};

/** Malformed worker output is ignored rather than rejected: the answer itself stays valid. */
export function parseTurnMemory(value: unknown): TurnMemory {
  const result = turnMemorySchema.safeParse(value);

  return result.success ? result.data : {};
}

export function parse<T, Input>(
  schema: z.ZodType<T, z.ZodTypeDef, Input>,
  value: unknown,
): T {
  return validate(
    schema,
    value,
    () =>
      new MemoryError(
        'invalid',
        'Invalid memory request. Check the fields and limits.',
      ),
  );
}
