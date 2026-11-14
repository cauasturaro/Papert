import { nextUtcDayStart, utcDayKey } from '../../../common/domain/utc-day.js';
import { ExecutionError } from '../execution.js';
import type { WorkerEvent } from '../execution.js';

// The execution_quota_check database constraint enforces the same limit.
export const DAILY_LIMIT = 100000;
export const ATTEMPT_BUDGET = 1000;
export const TUTOR_ATTEMPT_BUDGET = 8000;
// Must match Seymour's GENERATION_BUDGET.
export const GENERATION_ATTEMPT_BUDGET = 16000;
// Embeddings only: the goal plus candidates missing from Seymour's cache. Seymour receives it
// with the claim and stops comparing when the next candidate would not fit.
export const RECOMMENDATION_ATTEMPT_BUDGET = 8000;
export const MAX_ATTEMPTS = 3;
export const RESERVATION = ATTEMPT_BUDGET * MAX_ATTEMPTS;
export const RATE_LIMIT = 10;

export const period = (now: Date) => utcDayKey(now);
export const resetsAt = (now: Date) => nextUtcDayStart(now).getTime();

// Tutor, analysis, generation and recommendation use a model; older transport jobs do not.
export function usesModel(input: unknown) {
  const snapshot = input as Record<string, unknown>;

  return (
    !!snapshot.mode ||
    !!snapshot.attemptId ||
    snapshot.kind === 'generation' ||
    snapshot.kind === 'recommendation'
  );
}

export function attemptBudget(input: unknown) {
  const snapshot = input as Record<string, unknown>;

  if (snapshot.kind === 'generation') {
    return GENERATION_ATTEMPT_BUDGET;
  }

  if (snapshot.kind === 'recommendation') {
    return RECOMMENDATION_ATTEMPT_BUDGET;
  }

  return usesModel(input) ? TUTOR_ATTEMPT_BUDGET : ATTEMPT_BUDGET;
}

// A job may hold fewer than MAX_ATTEMPTS when the quota only had room for some.
export function retriesExhausted(job: {
  attempts: number;
  reserved: number;
  input: unknown;
}) {
  return (
    job.attempts >= MAX_ATTEMPTS || job.reserved < attemptBudget(job.input)
  );
}

/** The daily quota ran out; `resetsAt` is machine-readable for clients that show local time. */
export class QuotaExhaustedError extends ExecutionError {
  constructor(
    public readonly resetsAt: Date,
    now: Date,
  ) {
    const seconds = Math.max(
      1,
      Math.ceil((resetsAt.getTime() - now.getTime()) / 1000),
    );

    super(
      'rate_limited',
      "You have used today's quota for Seymour and analyses. It resets at the start of the next day.",
      seconds,
      resetsAt,
    );
  }
}

export function allocateQuota(
  quota: { used: number; reserved: number },
  budget: number,
  now: Date,
) {
  const remaining = DAILY_LIMIT - quota.used - quota.reserved;
  const attempts = Math.min(MAX_ATTEMPTS, Math.floor(remaining / budget));
  if (attempts < 1) {
    throw new QuotaExhaustedError(new Date(resetsAt(now)), now);
  }

  return budget * attempts;
}

export function usageRefund(
  job: { input: unknown; leases: string[]; settledLeases: string[] },
  event: WorkerEvent,
) {
  const budget = attemptBudget(job.input);
  if (event.tokens > budget) {
    throw new ExecutionError(
      'invalid',
      'Usage exceeds the authorized attempt budget.',
    );
  }

  if (
    event.status !== 'running' &&
    job.leases.includes(event.lease) &&
    !job.settledLeases.includes(event.lease)
  ) {
    return budget - event.tokens;
  }

  return null;
}
