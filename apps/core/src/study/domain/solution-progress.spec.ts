import { describe, expect, it } from 'vitest';

import { analyzedAttemptCount, solutionProgress } from './solution-progress.js';

const needsWork = { status: 'needs_work' };

describe('solution progress', () => {
  it('counts only analyzed needs_work attempts on distinct code', () => {
    const attempts = [
      { files: { 'a.ts': '1' }, result: needsWork },
      { files: { 'a.ts': '1' }, result: needsWork },
      { files: { 'a.ts': '2' }, result: { status: 'not_evaluated' } },
      { files: { 'a.ts': '3' }, result: { status: 'analysis_failed' } },
      { files: { 'a.ts': '4' }, result: { status: 'approved' } },
      { files: { 'a.ts': '5', 'b.ts': '' }, result: needsWork },
    ];

    const count = analyzedAttemptCount(attempts);

    expect(count).toBe(2);
  });

  it('treats the same files in a different key order as the same code', () => {
    const attempts = [
      { files: { 'a.ts': '1', 'b.ts': '2' }, result: needsWork },
      { files: { 'b.ts': '2', 'a.ts': '1' }, result: needsWork },
    ];

    expect(analyzedAttemptCount(attempts)).toBe(1);
  });

  it('unlocks after three analyzed attempts and caps the count', () => {
    expect(solutionProgress(2)).toEqual({
      analyzedAttempts: 2,
      required: 3,
      eligible: false,
    });
    expect(solutionProgress(5)).toEqual({
      analyzedAttempts: 3,
      required: 3,
      eligible: true,
    });
  });
});
