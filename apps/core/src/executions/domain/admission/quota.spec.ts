import {
  allocateQuota,
  period,
  DAILY_LIMIT,
  QuotaExhaustedError,
} from './quota.js';
import { describe, expect, it } from 'vitest';

import { attemptBudget, retriesExhausted, usageRefund } from './quota.js';

import { MAX_ATTEMPTS, RECOMMENDATION_ATTEMPT_BUDGET } from './quota.js';
import type { WorkerEvent } from '../execution.js';

const now = new Date('2026-11-03T23:59:59Z');
const job = {
  status: 'queued',
  deadline: new Date(now.getTime() + 1000),
  leaseUntil: null,
  attempts: 0,
  reserved: 3000,
  input: {},
};
const event: WorkerEvent = {
  version: 1,
  executionId: 'execution',
  lease: 'lease',
  index: 1,
  status: 'completed',
  text: 'Done',
  tokens: 200,
};

describe('quota', () => {
  it('uses the correct attempt budget and respects both retry bounds', () => {
    expect(attemptBudget({})).toBe(1000);
    expect(attemptBudget({ mode: 'doubt' })).toBe(8000);
    expect(attemptBudget({ attemptId: 'attempt' })).toBe(8000);
    expect(attemptBudget({ kind: 'generation' })).toBe(16000);
    expect(retriesExhausted(job)).toBe(false);
    expect(retriesExhausted({ ...job, attempts: MAX_ATTEMPTS })).toBe(true);
    expect(retriesExhausted({ ...job, reserved: 999 })).toBe(true);
  });

  it('settles each known lease once, including late results, and validates usage first', () => {
    const leased = {
      input: {},
      leases: ['lease', 'old'],
      settledLeases: ['old'],
    };

    expect(usageRefund(leased, event)).toBe(800);
    expect(usageRefund(leased, { ...event, tokens: 1000 })).toBe(0);
    expect(usageRefund(leased, { ...event, status: 'running' })).toBeNull();
    expect(usageRefund(leased, { ...event, lease: 'old' })).toBeNull();
    expect(usageRefund(leased, { ...event, lease: 'unknown' })).toBeNull();
    expect(() =>
      usageRefund(leased, { ...event, tokens: 1001, lease: 'unknown' }),
    ).toThrow('authorized attempt budget');
  });

  it('bounds usage by each kind’s own budget, not the larger generation one', () => {
    const tutor = {
      input: { mode: 'doubt' },
      leases: ['lease'],
      settledLeases: [],
    };
    const generation = { ...tutor, input: { kind: 'generation' } };

    expect(() => usageRefund(tutor, { ...event, tokens: 8001 })).toThrow(
      'authorized attempt budget',
    );

    expect(usageRefund(generation, { ...event, tokens: 12000 })).toBe(4000);
  });

  it('reserves only affordable complete attempts', () => {
    expect(allocateQuota({ used: 0, reserved: 0 }, 1000, now)).toBe(3000);
    expect(
      allocateQuota({ used: DAILY_LIMIT - 1999, reserved: 0 }, 1000, now),
    ).toBe(1000);
    expect(
      allocateQuota({ used: DAILY_LIMIT - 24000, reserved: 8000 }, 8000, now),
    ).toBe(16000);
  });

  it('reports an exhausted quota in plain words with a machine-readable reset', () => {
    let failure: unknown;

    try {
      allocateQuota({ used: DAILY_LIMIT - 999, reserved: 0 }, 1000, now);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(QuotaExhaustedError);

    const exhausted = failure as QuotaExhaustedError;

    expect(exhausted.message).toContain('quota');
    expect(exhausted.message).not.toContain('UTC');
    expect(exhausted.resetsAt.toISOString()).toBe('2026-11-04T00:00:00.000Z');
    expect(exhausted.retryAfterSeconds).toBe(
      Math.ceil((exhausted.resetsAt.getTime() - now.getTime()) / 1000),
    );
  });

  it('uses UTC dates for the daily quota period', () => {
    expect(period(new Date('2026-11-02T23:30:00-03:00'))).toBe('2026-11-03');
  });

  it('charges a recommendation attempt its own embedding budget', () => {
    const recommendation = { kind: 'recommendation', requestKey: 'key' };

    expect(attemptBudget(recommendation)).toBe(RECOMMENDATION_ATTEMPT_BUDGET);
    expect(RECOMMENDATION_ATTEMPT_BUDGET * MAX_ATTEMPTS).toBeLessThan(
      DAILY_LIMIT,
    );
  });
});
