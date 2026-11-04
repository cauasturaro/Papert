import { nextUtcDayStart, utcDayKey } from '../../common/domain/utc-day.js';
import { ExecutionError } from './execution.js';
import type { WorkerEvent } from './execution.js';

// The execution_quota_check database constraint enforces the same limit.
export const DAILY_LIMIT = 100000;
export const ATTEMPT_BUDGET = 1000;
export const TUTOR_ATTEMPT_BUDGET = 8000;
// Must match Seymour's GENERATION_BUDGET.
export const GENERATION_ATTEMPT_BUDGET = 16000;
export const MAX_ATTEMPTS = 3;
export const RESERVATION = ATTEMPT_BUDGET * MAX_ATTEMPTS;
export const RATE_LIMIT = 10;

export const period = (now: Date) => utcDayKey(now);
export const resetsAt = (now: Date) => nextUtcDayStart(now).getTime();

// Tutor, analysis and generation snapshots use the model; older transport jobs do not.
export function usesModel(input: unknown) {
  const snapshot = input as Record<string, unknown>;

  return (
    !!snapshot.mode || !!snapshot.attemptId || snapshot.kind === 'generation'
  );
}

export function attemptBudget(input: unknown) {
  const snapshot = input as Record<string, unknown>;

  if (snapshot.kind === 'generation') {
    return GENERATION_ATTEMPT_BUDGET;
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

export function allocateQuota(
  quota: { used: number; reserved: number },
  budget: number,
  now: Date,
) {
  const remaining = DAILY_LIMIT - quota.used - quota.reserved;
  const attempts = Math.min(MAX_ATTEMPTS, Math.floor(remaining / budget));
  if (attempts < 1) {
    const left = Math.max(0, remaining);
    const reset = period(new Date(resetsAt(now)));

    throw new ExecutionError(
      'rate_limited',
      `Not enough daily token quota for this request (${left} left, ${budget} needed). It resets on ${reset} at 00:00 UTC.`,
    );
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
