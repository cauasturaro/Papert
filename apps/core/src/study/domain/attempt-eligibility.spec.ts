import { describe, expect, it } from 'vitest';
import { assertAttemptEligible } from './attempt-eligibility.js';

describe('attempt eligibility', () => {
  it('accepts the current step', () => {
    expect(() =>
      assertAttemptEligible({ id: 'current' }, 'current'),
    ).not.toThrow();
  });

  it.each([undefined, { id: 'other' }])(
    'rejects a completed roadmap or another step: %s',
    (current) => {
      expect(() => assertAttemptEligible(current, 'current')).toThrow(
        'Only the current step accepts attempts.',
      );
    },
  );
});
