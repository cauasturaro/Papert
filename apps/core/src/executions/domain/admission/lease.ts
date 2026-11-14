import { terminal } from '../execution.js';
import type { WorkerEvent } from '../execution.js';
import { retriesExhausted } from './quota.js';

export const LEASE_MS = 60 * 1000;

type LeaseSnapshot = {
  status: string;
  deadline: Date;
  leaseUntil: Date | null;
  attempts: number;
  reserved: number;
  input: unknown;
};

export function claimDecision(
  job: LeaseSnapshot,
  now: Date,
):
  | { action: 'ignore'; status: string }
  | { action: 'finish'; status: 'timed_out' | 'failed' }
  | { action: 'claim'; status: 'running' } {
  if (terminal(job.status)) {
    return { action: 'ignore' as const, status: job.status };
  }
  if (job.deadline <= now) {
    return { action: 'finish' as const, status: 'timed_out' };
  }
  if (job.leaseUntil && job.leaseUntil > now) {
    return { action: 'ignore' as const, status: 'busy' };
  }
  if (retriesExhausted(job)) {
    return { action: 'finish' as const, status: 'failed' };
  }

  return { action: 'claim' as const, status: 'running' };
}

export function failureDecision(
  job: {
    status: string;
    lease: string | null;
    attempts: number;
    reserved: number;
    input: unknown;
  },
  lease: string,
):
  | { action: 'ignore'; status: string }
  | { action: 'finish'; status: 'failed' }
  | { action: 'release'; status: 'retry' } {
  if (terminal(job.status) || job.lease !== lease) {
    return { action: 'ignore' as const, status: job.status };
  }
  if (retriesExhausted(job)) {
    return { action: 'finish' as const, status: 'failed' };
  }

  return { action: 'release' as const, status: 'retry' };
}

export function activeLease(
  job: {
    status: string;
    lease: string | null;
    leaseUntil: Date | null;
    deadline: Date;
  },
  lease: string,
  leaseNow: Date,
  deadlineNow: Date,
) {
  return (
    job.status === 'running' &&
    job.lease === lease &&
    !!job.leaseUntil &&
    job.leaseUntil > leaseNow &&
    job.deadline > deadlineNow
  );
}

export function acceptsEvent(
  job: { lease: string | null; eventIndex: number; status: string },
  event: WorkerEvent,
) {
  return (
    job.lease === event.lease &&
    job.eventIndex < event.index &&
    !terminal(job.status)
  );
}
