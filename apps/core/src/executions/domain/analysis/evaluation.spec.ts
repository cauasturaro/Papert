import { randomUUID } from 'node:crypto';
import { assessEvaluation } from './evaluation.js';
import type { Evaluation } from './evaluation.js';

describe('assessEvaluation', () => {
  const attempt = {
    id: randomUUID(),
    revision: 4,
    stepId: 'validate-input',
    criteria: ['a', 'b'],
  };

  function evaluation(statuses: Record<string, 'met' | 'not_met'>): Evaluation {
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

  it('rejects absent evaluation', () => {
    expect(assessEvaluation(null, attempt)).toEqual({
      valid: false,
      reason: 'invalid_output',
    });
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
