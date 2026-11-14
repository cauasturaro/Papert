import { randomUUID } from 'node:crypto';
import { workerEvent } from './worker-event.contract.js';

describe('worker-event contract', () => {
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
      { tokens: 16001 },
      { index: 101 },
      { text: 'x'.repeat(4001) },
      { approved: true },
    ]) {
      expect(workerEvent.safeParse({ ...event, ...changes }).success).toBe(
        false,
      );
    }
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
