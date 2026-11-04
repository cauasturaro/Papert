import { z } from 'zod';
import { DomainError } from '../../common/domain/domain-error.js';
import { validate } from '../../common/domain/validation.js';

export class StudyError extends DomainError {}

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
    const paths = Object.keys(files);

    for (const entry of paths) {
      const directory = entry.endsWith('/');
      const name = directory ? entry.slice(0, -1) : entry;
      const parts = name.split('/');
      const ancestors = parts
        .slice(0, -1)
        .map((_, index) => parts.slice(0, index + 1).join('/'));
      const collides =
        ancestors.some((ancestor) => Object.hasOwn(files, ancestor)) ||
        (directory && Object.hasOwn(files, name));

      if (collides || (directory && files[entry] !== '')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Directories must be empty markers and cannot overlap files.',
        });
      }
    }

    if (
      Object.keys(files).length > 20 ||
      new TextEncoder().encode(JSON.stringify(files)).length > 64000
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use up to 20 files and 64 KB.',
      });
    }
  });

const stepId = z.string().regex(/^[a-z0-9-]+$/);

export const levelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const stepSchema = z
  .object({
    id: stepId,
    title: text,
    content: text,
    // Optional for older roadmaps; generated ones always set them.
    concepts: z
      .array(z.string().trim().min(1).max(80))
      .min(1)
      .max(6)
      .optional(),
    requires: z.array(stepId).max(5).optional(),
    challenge: z
      .object({
        instructions: text,
        criteria: z
          .array(z.object({ id: text, description: text }).strict())
          .min(1)
          .max(20),
      })
      .strict(),
  })
  .strict();

export const roadmapSchema = z
  .object({
    title: text,
    description: text,
    level: levelSchema.optional(),
    steps: z.array(stepSchema).min(1).max(50),
    starterFiles: filesSchema,
  })
  .strict()
  .superRefine(({ steps }, ctx) => {
    if (new Set(steps.map((step) => step.id)).size !== steps.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Step IDs must be unique.',
      });
    }

    const earlier = new Set<string>();

    for (const step of steps) {
      const ids = step.challenge.criteria.map((criterion) => criterion.id);

      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Criterion IDs must be unique.',
        });
      }

      // Prerequisites point backwards, so linear progression never meets an unmet one.
      const unmet = (step.requires ?? []).some((id) => !earlier.has(id));

      if (unmet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Steps may only require earlier steps.',
        });
      }

      earlier.add(step.id);
    }
  });

export const saveSchema = z
  .object({
    revision: z.number().int().nonnegative().max(2_147_483_646),
    notes: z.string().max(8000),
    files: filesSchema,
  })
  .strict();

export const attemptSchema = z
  .object({
    revision: z.number().int().nonnegative().max(2_147_483_646),
    stepId: z.string().regex(/^[a-z0-9-]+$/),
  })
  .strict();

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

export type RoadmapDefinition = z.infer<typeof roadmapSchema>;
export type Step = z.infer<typeof stepSchema>;
export type WorkspaceChanges = z.infer<typeof saveSchema>;

export type Level = z.infer<typeof levelSchema>;

export type Roadmap = {
  id: string;
  authorName: string;
  authorUserId: string | null;
  definition: RoadmapDefinition;
};

export type StudyAttempt = {
  id: string;
  stepId: string;
  revision: number;
  files: Record<string, string>;
  challenge: Step['challenge'];
  result: unknown;
  createdAt: Date;
};

export type Workspace = {
  id: string;
  roadmap: Roadmap;
  currentStep: number;
  revision: number;
  notes: string;
  files: Record<string, string>;
  session: { id: string; lastOpenedAt: Date };
  attempts: StudyAttempt[];
};

export type StudyableRoadmap = {
  roadmap: Roadmap;
  workspace: { id: string; currentStep: number } | null;
};

export interface StudyRepository {
  fixture(): Promise<Roadmap>;
  // Papert's roadmaps plus the learner's own generated ones, with their workspace if started.
  roadmaps(userId: string): Promise<StudyableRoadmap[]>;

  start(userId: string, roadmapId: string): Promise<Workspace | null>;
  workspace(userId: string, id: string): Promise<Workspace | null>;

  save(
    userId: string,
    id: string,
    changes: WorkspaceChanges,
  ): Promise<Workspace | null>;

  recordAttempt(
    userId: string,
    id: string,
    revision: number,
    stepId: string,
  ): Promise<StudyAttempt>;
}
