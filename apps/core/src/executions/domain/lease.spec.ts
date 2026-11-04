import { describe, expect, it } from 'vitest';
import {
  acceptsEvent,
  activeLease,
  claimDecision,
  failureDecision,
} from './lease.js';

import type { WorkerEvent } from './execution.js';

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

describe('lease', () => {
  it('prioritizes terminal state, deadline, live lease and exhausted retries in that order', () => {
    expect(
      claimDecision({ ...job, status: 'cancelled', deadline: now }, now),
    ).toEqual({ status: 'cancelled', action: 'ignore' });
    expect(
      claimDecision({ ...job, deadline: now, leaseUntil: job.deadline }, now),
    ).toEqual({ status: 'timed_out', action: 'finish' });
    expect(
      claimDecision({ ...job, leaseUntil: job.deadline, reserved: 0 }, now),
    ).toEqual({ status: 'busy', action: 'ignore' });
    expect(claimDecision({ ...job, reserved: 0 }, now)).toEqual({
      status: 'failed',
      action: 'finish',
    });
    expect(claimDecision({ ...job, leaseUntil: now }, now)).toEqual({
      status: 'running',
      action: 'claim',
    });
  });

  it('fences failures and out-of-order events', () => {
    const running = {
      ...job,
      status: 'running',
      lease: 'lease',
      eventIndex: 0,
    };

    expect(failureDecision(running, 'old')).toEqual({
      action: 'ignore',
      status: 'running',
    });
    expect(failureDecision(running, 'lease')).toEqual({
      action: 'release',
      status: 'retry',
    });
    expect(failureDecision({ ...running, reserved: 0 }, 'lease')).toEqual({
      action: 'finish',
      status: 'failed',
    });
    expect(acceptsEvent(running, event)).toBe(true);
    expect(acceptsEvent({ ...running, lease: 'new' }, event)).toBe(false);
    expect(acceptsEvent({ ...running, eventIndex: 1 }, event)).toBe(false);
    expect(acceptsEvent({ ...running, status: 'cancelled' }, event)).toBe(
      false,
    );
  });

  it('requires a live matching lease and a future deadline', () => {
    const running = {
      ...job,
      status: 'running',
      lease: 'lease',
      leaseUntil: job.deadline,
    };

    expect(activeLease(running, 'lease', now, now)).toBe(true);
    expect(activeLease(running, 'other', now, now)).toBe(false);
    expect(
      activeLease({ ...running, status: 'queued' }, 'lease', now, now),
    ).toBe(false);
    expect(
      activeLease({ ...running, leaseUntil: null }, 'lease', now, now),
    ).toBe(false);
    expect(
      activeLease({ ...running, leaseUntil: now }, 'lease', now, now),
    ).toBe(false);
    expect(activeLease({ ...running, deadline: now }, 'lease', now, now)).toBe(
      false,
    );
  });
});
