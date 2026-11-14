import { randomUUID } from 'node:crypto';
import { parseEvaluation } from './evaluation.contract.js';
import type { Evaluation } from '../../domain/analysis/evaluation.js';

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

  it('accepts an optional finding line and rejects a non-positive one', () => {
    const base = evaluation({ a: 'met', b: 'not_met' });
    const finding = base.findings[0];
    const withLine = { ...base, findings: [{ ...finding, line: 12 }] };
    const withNull = { ...base, findings: [{ ...finding, line: null }] };
    const withZero = { ...base, findings: [{ ...finding, line: 0 }] };

    expect(parseEvaluation(withLine)).toEqual(withLine);
    expect(parseEvaluation(withNull)).toEqual(withNull);
    expect(parseEvaluation(withZero)).toBeNull();
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
