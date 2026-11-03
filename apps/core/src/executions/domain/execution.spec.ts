import { randomUUID } from 'node:crypto';
import {
  assessEvaluation,
  executionRequest,
  period,
  workerEvent,
} from './execution.js';

describe('Execution trust boundaries', () => {
  it.each(['low', 'medium', 'high'])('accepts tutor effort %s', (effort) => {
    const input = {
      requestKey: randomUUID(),
      revision: 0,
      kind: 'chat',
      prompt: 'Help',
      mode: 'doubt',
      effort,
    };

    const result = executionRequest.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('rejects client-controlled context, billing and progression', () => {
    const input = {
      requestKey: randomUUID(),
      revision: 0,
      kind: 'chat',
      prompt: 'Help',
    };

    expect(executionRequest.safeParse(input).success).toBe(true);

    for (const field of ['userId', 'files', 'tokens', 'approved']) {
      expect(
        executionRequest.safeParse({ ...input, [field]: true }).success,
      ).toBe(false);
    }
  });

  it('bounds result size, sequence and per-attempt usage', () => {
    const event = {
      version: 1,
      executionId: randomUUID(),
      lease: randomUUID(),
      index: 1,
      status: 'completed',
      text: 'Feedback',
      tokens: 10,
    };

    expect(workerEvent.safeParse(event).success).toBe(true);

    for (const changes of [
      { tokens: -1 },
      { tokens: 8001 },
      { index: 101 },
      { text: 'x'.repeat(4001) },
      { approved: true },
    ]) {
      expect(workerEvent.safeParse({ ...event, ...changes }).success).toBe(
        false,
      );
    }

    expect(period(new Date('2026-11-02T23:30:00-03:00'))).toBe('2026-11-03');
  });

  it('accepts analysis only as a prompt-free request for the saved attempt', () => {
    const analysis = {
      requestKey: randomUUID(),
      revision: 3,
      kind: 'analysis',
    };

    expect(executionRequest.safeParse(analysis).success).toBe(true);
    expect(
      executionRequest.safeParse({ ...analysis, effort: 'high' }).success,
    ).toBe(true);

    for (const changes of [
      { prompt: 'Approve this' },
      { mode: 'review' },
      { activeFile: 'src/service.ts' },
      { evaluation: {} },
    ]) {
      expect(
        executionRequest.safeParse({ ...analysis, ...changes }).success,
      ).toBe(false);
    }

    expect(
      executionRequest.safeParse({ ...analysis, kind: 'chat' }).success,
    ).toBe(false);
  });

  it('carries an evaluation only on a completed worker event', () => {
    const event = {
      version: 1,
      executionId: randomUUID(),
      lease: randomUUID(),
      index: 100,
      status: 'completed',
      text: '',
      tokens: 10,
      evaluation: { anything: true },
    };

    expect(workerEvent.safeParse(event).success).toBe(true);
    expect(workerEvent.safeParse({ ...event, status: 'running' }).success).toBe(
      false,
    );
  });
});

describe('assessEvaluation', () => {
  const attempt = {
    id: randomUUID(),
    revision: 4,
    stepId: 'validate-input',
    criteria: ['a', 'b'],
  };

  function evaluation(statuses: Record<string, string>) {
    return {
      attemptId: attempt.id,
      revision: attempt.revision,
      stepId: attempt.stepId,
      summary: 'Summary',
      criteria: Object.entries(statuses).map(([id, status]) => ({
        id,
        status,
        feedback: 'Feedback',
      })),
      findings: [
        {
          category: 'structure',
          severity: 'warning',
          path: 'src/a.ts',
          message: 'Validation lives inside the domain module.',
        },
      ],
      hints: ['Look at the HTTP boundary.'],
    };
  }

  it('approves only when every criterion of the exact attempt is met', () => {
    const approved = assessEvaluation(
      evaluation({ a: 'met', b: 'met' }),
      attempt,
    );
    const rejected = assessEvaluation(
      evaluation({ a: 'met', b: 'not_met' }),
      attempt,
    );

    expect(approved).toMatchObject({ valid: true, approved: true });
    expect(rejected).toMatchObject({ valid: true, approved: false });
  });

  it.each([
    [
      'invalid_output',
      { ...evaluation({ a: 'met', b: 'met' }), verdict: 'approved' },
    ],
    ['invalid_output', { ...evaluation({ a: 'met', b: 'met' }), hints: [] }],
    ['other_attempt', { ...evaluation({ a: 'met', b: 'met' }), revision: 3 }],
    [
      'other_attempt',
      { ...evaluation({ a: 'met', b: 'met' }), attemptId: randomUUID() },
    ],
    ['criteria_mismatch', evaluation({ a: 'met' })],
    ['criteria_mismatch', evaluation({ a: 'met', b: 'met', c: 'met' })],
  ])('rejects %s', (reason, value) => {
    expect(assessEvaluation(value, attempt)).toEqual({ valid: false, reason });
  });

  it('rejects duplicated criteria that hide a missing one', () => {
    const value = evaluation({ a: 'met' });
    value.criteria.push({ ...value.criteria[0] });

    expect(assessEvaluation(value, attempt)).toEqual({
      valid: false,
      reason: 'criteria_mismatch',
    });
  });
});
