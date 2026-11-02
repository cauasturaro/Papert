import { randomUUID } from 'node:crypto';
import { executionRequest, workerEvent, period } from './execution.js';

describe('Execution trust boundaries', () => {
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
      { tokens: 1001 },
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
});
