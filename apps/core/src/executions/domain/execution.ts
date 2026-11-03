import { z } from 'zod';
import type { SyntaxReport } from '../../analysis/domain/syntax.js';
import { DomainError } from '../../common/domain/domain-error.js';

export class ExecutionError extends DomainError {}

export const DAILY_LIMIT = 30000;
export const ATTEMPT_BUDGET = 1000;
export const TUTOR_ATTEMPT_BUDGET = 8000;
export const MAX_ATTEMPTS = 3;
export const RESERVATION = ATTEMPT_BUDGET * MAX_ATTEMPTS;
export const RATE_LIMIT = 10;
export const DEADLINE_MS = 15 * 60 * 1000;
export const LEASE_MS = 60 * 1000;
export const terminal = (status: string) =>
  !['queued', 'running'].includes(status);
export const period = (now: Date) => now.toISOString().slice(0, 10);

export const executionRequest = z
  .object({
    requestKey: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    kind: z.enum(['chat', 'analysis']),
    prompt: z.string().trim().min(1).max(2000).optional(),
    mode: z.enum(['doubt', 'teaching', 'solution', 'review']).optional(),
    effort: z.enum(['low', 'medium', 'high']).optional(),
    activeFile: z.string().min(1).max(200).optional(),
    selection: z
      .object({
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((input) => !input.mode || input.kind === 'chat')
  .refine((input) => input.kind === 'analysis' || !!input.prompt)
  // Analysis evaluates the saved attempt; it accepts no free-form instructions.
  .refine(
    (input) =>
      input.kind === 'chat' ||
      (!input.prompt && !input.activeFile && !input.selection),
  )
  .refine(
    (input) =>
      input.kind === 'analysis' ||
      input.mode ||
      (!input.effort && !input.activeFile && !input.selection),
  );

// Tutor and analysis snapshots carry a mode or an attempt; older transport jobs carry neither.
export function usesModel(input: unknown) {
  const snapshot = input as Record<string, unknown>;

  return !!snapshot.mode || !!snapshot.attemptId;
}

export const workerEvent = z
  .object({
    version: z.literal(1),
    executionId: z.string().uuid(),
    lease: z.string().uuid(),
    index: z.number().int().min(1).max(100),
    status: z.enum(['running', 'completed', 'failed']),
    text: z.string().max(4000),
    tokens: z.number().int().min(0).max(TUTOR_ATTEMPT_BUDGET),
    // Validated against the attempt by Core; malformed content is recorded, never trusted.
    evaluation: z.unknown().optional(),
  })
  .strict()
  .refine(
    (event) => event.evaluation === undefined || event.status === 'completed',
  );

export type WorkerEvent = z.infer<typeof workerEvent>;

export const evaluationSchema = z
  .object({
    attemptId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    stepId: z.string().min(1).max(100),
    summary: z.string().min(1).max(800),
    criteria: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            status: z.enum(['met', 'not_met']),
            feedback: z.string().min(1).max(600),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    findings: z
      .array(
        z
          .object({
            category: z.enum(['logic', 'contract', 'structure', 'security']),
            severity: z.enum(['info', 'warning', 'error']),
            path: z.string().max(200).nullable(),
            message: z.string().min(1).max(400),
          })
          .strict(),
      )
      .max(10),
    hints: z.array(z.string().min(1).max(300)).min(1).max(3),
  })
  .strict();

export type Evaluation = z.infer<typeof evaluationSchema>;

export type AttemptSnapshot = {
  id: string;
  revision: number;
  stepId: string;
  criteria: string[];
};

// Core, not the model, decides approval: every criterion of this exact attempt must be met.
export function assessEvaluation(value: unknown, attempt: AttemptSnapshot) {
  const parsed = evaluationSchema.safeParse(value);
  if (!parsed.success) {
    return { valid: false as const, reason: 'invalid_output' };
  }

  const evaluation = parsed.data;
  if (
    evaluation.attemptId !== attempt.id ||
    evaluation.revision !== attempt.revision ||
    evaluation.stepId !== attempt.stepId
  ) {
    return { valid: false as const, reason: 'other_attempt' };
  }

  const reported = evaluation.criteria.map((criterion) => criterion.id);
  const expected = [...attempt.criteria].sort();
  if (
    reported.length !== expected.length ||
    [...reported].sort().some((id, index) => id !== expected[index])
  ) {
    return { valid: false as const, reason: 'criteria_mismatch' };
  }

  const approved = evaluation.criteria.every(
    (criterion) => criterion.status === 'met',
  );

  return { valid: true as const, approved, evaluation };
}

export interface ExecutionQueue {
  publish(id: string): Promise<void>;
}

export type ExecutionRequest = z.infer<typeof executionRequest>;

export type ExecutionRecord = {
  id: string;
  workspaceId: string;
  input: unknown;
  status: string;
  text: string;
  sequence: number;
  attempts: number;
  charged: number;
  reserved: number;
  createdAt: Date;
  firstEventAt: Date | null;
  finishedAt: Date | null;
  deadline: Date;
  publishedAt: Date | null;
};

export interface ExecutionRepository {
  quota(userId: string): Promise<{
    period: string;
    timezone: string;
    limit: number;
    used: number;
    reserved: number;
    reservation: number;
    resetsAt: number;
  }>;
  create(
    userId: string,
    workspaceId: string,
    input: ExecutionRequest,
    syntax?: SyntaxReport,
  ): Promise<ExecutionRecord>;
  // Returns null when the revision is no longer current, so a retried request key can still resolve.
  analysisFiles(
    userId: string,
    workspaceId: string,
    revision: number,
  ): Promise<Record<string, string> | null>;
  rejectSyntax(
    userId: string,
    workspaceId: string,
    revision: number,
    syntax: SyntaxReport,
  ): Promise<{ id: string; revision: number; stepId: string; result: unknown }>;
  owned(userId: string, id: string): Promise<ExecutionRecord>;
  list(userId: string, workspaceId: string): Promise<ExecutionRecord[]>;
  cancel(userId: string, id: string): Promise<ExecutionRecord>;
  claim(id: string): Promise<{
    status: string;
    lease?: string;
    input?: unknown;
    budget?: number;
  }>;
  failed(id: string, lease: string): Promise<{ status: string }>;
  active(id: string, lease: string): Promise<boolean>;
  accept(event: WorkerEvent): Promise<ExecutionRecord>;
  markPublished(id: string): Promise<void>;
  pending(): Promise<ExecutionRecord[]>;
  expire(): Promise<number>;
}
