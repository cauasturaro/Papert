import { z } from 'zod';
import { FAILURE_CODES } from '../../domain/source.js';

// Wire formats of the HTTP registration and the IAM-only control endpoint.

const filename = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\\/\p{Cc}]/u.test(value), 'Invalid file name.');

export const registerSchema = z.strictObject({
  filename,
  contentType: z.string().max(200),
  // The domain bounds upload sizes; keep the wire contract accepting all integers.
  size: z.number().refine(Number.isInteger).min(1),
});

const objectReference = {
  bucket: z.string().min(1).max(63),
  key: z.string().min(1).max(1024),
};

const versionReference = {
  documentId: z.guid(),
  versionId: z.string().min(1).max(1024),
  sequencer: z.string().regex(/^[0-9A-Fa-f]{1,64}$/),
};

export const controlSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('begin'),
    ...objectReference,
    versionId: versionReference.versionId,
    sequencer: versionReference.sequencer,
    size: z.number().refine(Number.isInteger).min(0),
  }),
  z.strictObject({
    action: z.literal('complete'),
    ...versionReference,
    chunkCount: z.number().refine(Number.isInteger).min(1),
    characterCount: z.number().refine(Number.isInteger).min(1),
    pageCount: z.number().refine(Number.isInteger).min(1).nullable(),
    embeddingTokens: z.number().refine(Number.isInteger).min(0),
    warnings: z.array(z.string().max(200)).max(10),
  }),
  z.strictObject({
    action: z.literal('fail'),
    ...versionReference,
    code: z.enum(FAILURE_CODES),
  }),
  z.strictObject({
    action: z.literal('removal'),
    ...objectReference,
  }),
  // Operator-requested re-extraction of the current version after pipeline changes.
  z.strictObject({
    action: z.literal('reindex'),
    documentId: z.guid(),
  }),
]);

export type ControlRequest = z.infer<typeof controlSchema>;
