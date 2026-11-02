import { z } from 'zod';

export class StudyError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const text = z.string().trim().min(1).max(8000);
const path = z
  .string()
  .max(200)
  .refine((value) =>
    value
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

export const stepSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: text,
    content: text,
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

    for (const step of steps) {
      const ids = step.challenge.criteria.map((criterion) => criterion.id);

      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Criterion IDs must be unique.',
        });
      }
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
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new StudyError(
      400,
      'Invalid study request. Check the fields and limits.',
    );
  }

  return result.data;
}

export type RoadmapDefinition = z.infer<typeof roadmapSchema>;
export type Step = z.infer<typeof stepSchema>;
export type WorkspaceChanges = z.infer<typeof saveSchema>;

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

export interface StudyRepository {
  fixture(): Promise<Roadmap>;

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
