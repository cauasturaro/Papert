import { randomUUID } from 'node:crypto';
import { parseEvaluation } from './evaluation.contract.js';
import type { Evaluation } from '../../domain/evaluation.js';

describe('evaluation contract', () => {
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

  it('accepts valid output', () => {
    const value = evaluation({ a: 'met', b: 'met' });

    expect(parseEvaluation(value)).toEqual(value);
  });

  it.each([
    [
      'invalid_output',
      { ...evaluation({ a: 'met', b: 'met' }), verdict: 'approved' },
    ],
    ['invalid_output', { ...evaluation({ a: 'met', b: 'met' }), hints: [] }],
  ])('rejects %s', (_reason, value) => {
    expect(parseEvaluation(value)).toBeNull();
  });
});
