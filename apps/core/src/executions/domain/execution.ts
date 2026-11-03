import { z } from 'zod';

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
    prompt: z.string().trim().min(1).max(2000),
    mode: z.enum(['doubt', 'teaching', 'solution']).optional(),
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
  .refine(
    (input) =>
      input.mode || (!input.effort && !input.activeFile && !input.selection),
  );

export const workerEvent = z
  .object({
    version: z.literal(1),
    executionId: z.string().uuid(),
    lease: z.string().uuid(),
    index: z.number().int().min(1).max(100),
    status: z.enum(['running', 'completed', 'failed']),
    text: z.string().max(4000),
    tokens: z.number().int().min(0).max(TUTOR_ATTEMPT_BUDGET),
  })
  .strict();

export type WorkerEvent = z.infer<typeof workerEvent>;

export interface ExecutionQueue {
  publish(id: string): Promise<void>;
}

export type ExecutionRequest = z.infer<typeof executionRequest>;

export type ExecutionRecord = {
  id: string;
  workspaceId: string;
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
  ): Promise<ExecutionRecord>;
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
