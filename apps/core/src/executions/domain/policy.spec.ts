import { describe, expect, it } from 'vitest';
import {
  acceptsEvent,
  activeLease,
  activeStudyStep,
  admissionBudget,
  allocateQuota,
  analysisOutcome,
  assertAnalysisRetry,
  assertRateLimit,
  assertSameRequest,
  assertSavedRevision,
  assertSavedSelection,
  assertSolutionEligible,
  attemptBudget,
  claimDecision,
  failureDecision,
  retriesExhausted,
  solutionEligible,
  usageRefund,
} from './policy.js';
import { DAILY_LIMIT, MAX_ATTEMPTS } from './execution.js';
import type { ExecutionRequest, WorkerEvent } from './execution.js';

const now = new Date('2026-11-03T23:59:59Z');
const request: ExecutionRequest = {
  requestKey: 'request',
  kind: 'chat',
  revision: 1,
  prompt: 'Help',
};
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

describe('execution admission policies', () => {
  it('selects the request budget before an attempt exists and requires an active study context', () => {
    expect(admissionBudget({ kind: 'chat' })).toBe(1000);
    expect(admissionBudget({ kind: 'chat', mode: 'doubt' })).toBe(8000);
    expect(admissionBudget({ kind: 'analysis' })).toBe(8000);
    expect(activeStudyStep({ id: 'step' })).toEqual({ id: 'step' });
    expect(() => activeStudyStep(undefined)).toThrow('No active study step.');
    expect(() => activeStudyStep({ id: 'step' }, false)).toThrow(
      'No active study step.',
    );
  });

  it('matches idempotent requests including optional context and workspace', () => {
    const previous = { workspaceId: 'workspace', input: request };

    expect(() =>
      assertSameRequest(previous, 'workspace', request),
    ).not.toThrow();
    expect(() => assertSameRequest(previous, 'other', request)).toThrow(
      'different request',
    );
    expect(() =>
      assertSameRequest(previous, 'workspace', {
        ...request,
        prompt: 'Changed',
      }),
    ).toThrow('different request');
    expect(() =>
      assertSameRequest(previous, 'workspace', {
        ...request,
        sourceIds: ['source'],
      }),
    ).toThrow('different request');
    expect(() => assertSavedRevision(1, 2)).toThrow('Save and reload');
  });

  it('validates saved files and selection bounds', () => {
    const files = { 'main.ts': 'abc', 'empty/': '' };
    const selected = {
      ...request,
      activeFile: 'main.ts',
      selection: { start: 0, end: 3 },
    };

    expect(() => assertSavedSelection(selected, files)).not.toThrow();
    expect(() =>
      assertSavedSelection({ ...selected, activeFile: 'missing.ts' }, files),
    ).toThrow('Select a file');
    expect(() =>
      assertSavedSelection({ ...selected, activeFile: 'empty/' }, files),
    ).toThrow('Select a file');
    expect(() =>
      assertSavedSelection(
        { ...selected, selection: { start: 3, end: 2 } },
        files,
      ),
    ).toThrow('outside');
    expect(() =>
      assertSavedSelection(
        { ...selected, selection: { start: 0, end: 4 } },
        files,
      ),
    ).toThrow('outside');
  });

  it('requires three attempts only for solution guidance', () => {
    expect(solutionEligible(2)).toBe(false);
    expect(solutionEligible(3)).toBe(true);
    expect(() => assertSolutionEligible('solution', false)).toThrow(
      'three saved attempts',
    );
    expect(() => assertSolutionEligible('review', false)).not.toThrow();
  });

  it.each(['approved', 'needs_work'])(
    'rejects a finalized analysis: %s',
    (status) => {
      expect(() => assertAnalysisRetry({ status })).toThrow('already analyzed');
    },
  );

  it('rejects a running analysis but permits failed, cancelled and timed-out retries', () => {
    const state = { status: 'evaluating', executionId: 'execution' };

    expect(() => assertAnalysisRetry(state, 'running')).toThrow(
      'already running',
    );
    expect(() => assertAnalysisRetry(state, 'queued')).toThrow(
      'already running',
    );
    expect(() => assertAnalysisRetry(state)).not.toThrow();

    for (const status of ['failed', 'cancelled', 'timed_out']) {
      expect(() => assertAnalysisRetry(state, status)).not.toThrow();
    }
  });

  it('enforces rate limit and reserves only affordable complete attempts', () => {
    expect(() => assertRateLimit(9)).not.toThrow();
    expect(() => assertRateLimit(10)).toThrow('one minute');
    expect(allocateQuota({ used: 0, reserved: 0 }, 1000, now)).toBe(3000);
    expect(
      allocateQuota({ used: DAILY_LIMIT - 1999, reserved: 0 }, 1000, now),
    ).toBe(1000);
    expect(
      allocateQuota({ used: DAILY_LIMIT - 24000, reserved: 8000 }, 8000, now),
    ).toBe(16000);
    expect(() =>
      allocateQuota({ used: DAILY_LIMIT - 999, reserved: 0 }, 1000, now),
    ).toThrow('999 left, 1000 needed). It resets on 2026-11-04 at 00:00 UTC.');
  });
});

describe('execution lifecycle policies', () => {
  it('uses the correct attempt budget and respects both retry bounds', () => {
    expect(attemptBudget({})).toBe(1000);
    expect(attemptBudget({ mode: 'doubt' })).toBe(8000);
    expect(attemptBudget({ attemptId: 'attempt' })).toBe(8000);
    expect(attemptBudget({ kind: 'generation' })).toBe(16000);
    expect(retriesExhausted(job)).toBe(false);
    expect(retriesExhausted({ ...job, attempts: MAX_ATTEMPTS })).toBe(true);
    expect(retriesExhausted({ ...job, reserved: 999 })).toBe(true);
  });

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

  it.each(['met', 'not_met'] as const)(
    'records a valid evaluation with criterion status %s',
    (criterionStatus) => {
      const snapshot = {
        id: '4ca755d9-108c-497c-b9a0-1dab240cb901',
        stepId: 'step',
        revision: 1,
        criteria: ['criterion'],
      };
      const evaluation = {
        attemptId: snapshot.id,
        stepId: snapshot.stepId,
        revision: snapshot.revision,
        summary: 'Checked',
        criteria: [
          { id: 'criterion', status: criterionStatus, feedback: 'Feedback' },
        ],
        findings: [],
        hints: ['Review the boundary.'],
      };

      const outcome = analysisOutcome(
        snapshot,
        'execution',
        'completed',
        evaluation,
        now,
      );

      expect(outcome.approved).toBe(criterionStatus === 'met');
      expect(outcome.result).toEqual({
        status: criterionStatus === 'met' ? 'approved' : 'needs_work',
        executionId: 'execution',
        evaluatedAt: now.toISOString(),
        evaluation,
      });
    },
  );

  it('records missing or malformed evaluation as failed without approval', () => {
    const snapshot = {
      id: 'attempt',
      stepId: 'step',
      revision: 1,
      criteria: ['criterion'],
    };

    const missing = analysisOutcome(
      snapshot,
      'execution',
      'completed',
      undefined,
      now,
    );
    const cancelled = analysisOutcome(
      snapshot,
      'execution',
      'cancelled',
      undefined,
      now,
    );
    const invalid = analysisOutcome(
      snapshot,
      'execution',
      'completed',
      {},
      now,
    );

    expect(missing.result).toMatchObject({
      status: 'analysis_failed',
      reason: 'no_evaluation',
    });
    expect(cancelled.result).toMatchObject({ reason: 'cancelled' });
    expect(invalid).toMatchObject({
      approved: false,
      result: { reason: 'invalid_output' },
    });
  });
});
