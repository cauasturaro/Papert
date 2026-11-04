import { z } from 'zod';
import { FAILURE_CODES } from '../../domain/source.js';

// Wire formats of the HTTP registration and the IAM-only control endpoint.

const filename = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\\/\p{Cc}]/u.test(value), 'Invalid file name.');

export const registerSchema = z
  .object({
    filename,
    contentType: z.string().max(200),
    size: z.number().int().min(1),
  })
  .strict();

const objectReference = {
  bucket: z.string().min(1).max(63),
  key: z.string().min(1).max(1024),
};

const versionReference = {
  documentId: z.string().uuid(),
  versionId: z.string().min(1).max(1024),
  sequencer: z.string().regex(/^[0-9A-Fa-f]{1,64}$/),
};

export const controlSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('begin'),
      ...objectReference,
      versionId: versionReference.versionId,
      sequencer: versionReference.sequencer,
      size: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      action: z.literal('complete'),
      ...versionReference,
      chunkCount: z.number().int().min(1),
      characterCount: z.number().int().min(1),
      pageCount: z.number().int().min(1).nullable(),
      embeddingTokens: z.number().int().min(0),
      warnings: z.array(z.string().max(200)).max(10),
    })
    .strict(),
  z
    .object({
      action: z.literal('fail'),
      ...versionReference,
      code: z.enum(FAILURE_CODES),
    })
    .strict(),
  z
    .object({
      action: z.literal('removal'),
      ...objectReference,
    })
    .strict(),
  // Operator-requested re-extraction of the current version after pipeline changes.
  z
    .object({
      action: z.literal('reindex'),
      documentId: z.string().uuid(),
    })
    .strict(),
]);

export type ControlRequest = z.infer<typeof controlSchema>;
