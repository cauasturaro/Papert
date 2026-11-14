import { describe, expect, it } from 'vitest';
import { terminal } from './execution.js';

describe('terminal', () => {
  it('treats queued and running executions as still in progress', () => {
    expect(terminal('queued')).toBe(false);
    expect(terminal('running')).toBe(false);
  });

  it('treats every finished status as terminal', () => {
    for (const status of ['completed', 'failed', 'cancelled', 'timed_out']) {
      expect(terminal(status)).toBe(true);
    }
  });
});
