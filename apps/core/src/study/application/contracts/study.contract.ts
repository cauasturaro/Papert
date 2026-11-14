import { workspaceFilesProblem } from '../../domain/workspace-files.js';
import { roadmapStructureProblem } from '../../domain/roadmap-definition.js';
import { z } from 'zod';
import { validate } from '../../../common/application/validation.js';
import { StudyError } from '../../domain/study.js';

const text = z.string().trim().min(1).max(8000);
const path = z
  .string()
  .max(200)
  .refine((value) =>
    value
      .replace(/\/$/, '')
      .split('/')
      .every(
        (part) =>
          /^[a-zA-Z0-9_.-]+$/.test(part) &&
          !['.', '..', '__proto__', 'constructor', 'prototype'].includes(part),
      ),
  );

export const filesSchema = z
  .record(path, z.string().max(16000))
  .superRefine((files, ctx) => {
    for (const message of workspaceFilesProblem(files)) {
      ctx.addIssue({ code: 'custom', message });
    }

    if (
      Object.keys(files).length > 20 ||
      new TextEncoder().encode(JSON.stringify(files)).length > 64000
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use up to 20 files and 64 KB.',
      });
    }
  });

const stepId = z.string().regex(/^[a-z0-9-]+$/);

export const levelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const stepSchema = z.strictObject({
  id: stepId,
  title: text,
  content: text,
  // Optional for older roadmaps; generated ones always set them.
  concepts: z.array(z.string().trim().min(1).max(80)).min(1).max(6).optional(),
  requires: z.array(stepId).max(5).optional(),
  challenge: z.strictObject({
    instructions: text,
    criteria: z
      .array(z.strictObject({ id: text, description: text }))
      .min(1)
      .max(20),
  }),
});

export const roadmapSchema = z
  .strictObject({
    title: text,
    description: text,
    level: levelSchema.optional(),
    steps: z.array(stepSchema).min(1).max(50),
    starterFiles: filesSchema,
  })
  .superRefine(({ steps }, ctx) => {
    for (const message of roadmapStructureProblem(steps)) {
      ctx.addIssue({ code: 'custom', message });
    }
  });

export const saveSchema = z.strictObject({
  revision: z.number().int().nonnegative().max(2_147_483_646),
  notes: z.string().max(8000),
  files: filesSchema,
});

export const attemptSchema = z.strictObject({
  revision: z.number().int().nonnegative().max(2_147_483_646),
  stepId: z.string().regex(/^[a-z0-9-]+$/),
});

export const saveResponseSchema = z.enum(['full', 'summary']).optional();

// Query strings arrive as text; the limit is coerced and bounded.
export const DEFAULT_ATTEMPT_PAGE = 20;

export const attemptPageSchema = z.strictObject({
  cursor: z.guid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  stepId: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  return validate(
    schema,
    value,
    () =>
      new StudyError(
        'invalid',
        'Invalid study request. Check the fields and limits.',
      ),
  );
}
