import { describe, expect, it } from 'vitest';
import type {
  AnswerFeedback,
  FeedbackSignal,
  FeedbackWrite,
  RatedAnswer,
} from '../domain/feedback.js';
import type { FeedbackRepository } from '../domain/ports/feedback-repository.js';
import { FeedbackService } from './feedback.service.js';

const USER = '0b4b5d55-1a5f-4f0d-9d4a-7a4bd8a6d1f1';
const EXECUTION = '7c0e1b0e-3f39-4a55-9f35-a3f1d4b9a2c1';
const NOW = new Date('2026-11-05T10:00:00Z');

class MemoryFeedback implements FeedbackRepository {
  rows = new Map<string, AnswerFeedback>();

  async forUser(_userId: string, ids: string[]) {
    return ids.flatMap((id) => (this.rows.has(id) ? [this.rows.get(id)!] : []));
  }

  async write(
    _userId: string,
    executionId: string,
    now: Date,
    plan: (current: AnswerFeedback | null) => FeedbackWrite | null,
  ) {
    const current = this.rows.get(executionId) ?? null;
    const change = plan(current);

    if (change === null) {
      return current!;
    }

    const row: AnswerFeedback = {
      executionId,
      ...change,
      deliveredRevision: current?.deliveredRevision ?? 0,
      deliveryAttempts: 0,
      nextDeliveryAt: now,
      updatedAt: now,
    };
    this.rows.set(executionId, row);

    return row;
  }

  async claimDue(
    now: Date,
    claimUntil: Date,
    limit: number,
    executionId?: string,
  ) {
    const due = [...this.rows.values()].filter(
      (row) =>
        row.nextDeliveryAt !== null &&
        row.nextDeliveryAt <= now &&
        (executionId === undefined || row.executionId === executionId),
    );

    for (const row of due) {
      row.nextDeliveryAt = claimUntil;
    }

    return due.slice(0, limit).map((row) => ({ ...row }));
  }

  async delivered(executionId: string, revision: number) {
    const row = this.rows.get(executionId)!;
    row.deliveredRevision = revision;

    if (row.revision === revision) {
      row.nextDeliveryAt = null;
    }
  }

  async deferred(executionId: string, _revision: number, retryAt: Date) {
    const row = this.rows.get(executionId)!;
    row.deliveryAttempts += 1;
    row.nextDeliveryAt = retryAt;
  }
}

class RecordingSink {
  failing = false;
  sent: FeedbackSignal[] = [];

  async send(signal: FeedbackSignal) {
    if (this.failing) {
      throw new Error('Langfuse unavailable');
    }

    this.sent.push(signal);
  }
}

function setup(answer: RatedAnswer = { kind: 'chat', status: 'completed' }) {
  const repository = new MemoryFeedback();
  const sink = new RecordingSink();
  const answers = { answer: async () => answer };

  const service = new FeedbackService(repository, answers, sink, () => NOW);

  return { service, repository, sink, sent: sink.sent };
}

describe('FeedbackService', () => {
  it('stores the verdict and sends it to tracing right away', async () => {
    const { service, sent } = setup();

    const view = await service.rate(USER, EXECUTION, { rating: 'up' });

    expect(view).toMatchObject({
      rating: 'up',
      hallucination: false,
      delivered: true,
    });
    expect(sent).toEqual([
      {
        executionId: EXECUTION,
        rating: 'up',
        hallucination: false,
        revision: 1,
      },
    ]);
  });

  it('keeps a failed send pending and delivers it on the scheduled retry', async () => {
    const { service, repository, sink, sent } = setup();
    sink.failing = true;

    const view = await service.rate(USER, EXECUTION, {
      rating: 'down',
      hallucination: true,
    });

    expect(view.delivered).toBe(false);
    expect(repository.rows.get(EXECUTION)?.nextDeliveryAt?.toISOString()).toBe(
      '2026-11-05T10:02:00.000Z',
    );

    sink.failing = false;
    repository.rows.get(EXECUTION)!.nextDeliveryAt = NOW;

    const retry = await service.deliverDue();

    expect(retry).toEqual({ claimed: 1, delivered: 1 });
    expect(sent.map((signal) => signal.hallucination)).toEqual([true]);
  });

  it('sends nothing when the learner repeats the same verdict', async () => {
    const { service, sent } = setup();

    await service.rate(USER, EXECUTION, { rating: 'up' });
    await service.rate(USER, EXECUTION, { rating: 'up' });

    expect(sent).toHaveLength(1);
  });

  it('refuses unfinished answers and malformed bodies before storing', async () => {
    const running = setup({ kind: 'chat', status: 'running' });
    const valid = setup();

    await expect(
      running.service.rate(USER, EXECUTION, { rating: 'up' }),
    ).rejects.toThrow('Only finished answers can be rated.');
    await expect(
      valid.service.rate(USER, EXECUTION, { rating: 'up', note: 'free text' }),
    ).rejects.toThrow('Invalid feedback request.');
    expect(running.repository.rows.size).toBe(0);
    expect(valid.repository.rows.size).toBe(0);
  });

  it('lists the verdicts of the requested answers', async () => {
    const { service } = setup();

    await service.rate(USER, EXECUTION, { rating: 'down' });

    const listed = await service.list(USER, `${EXECUTION},`);
    const invalid = service.list(USER, 'not-an-id');

    expect(listed.map((item) => item.rating)).toEqual(['down']);
    await expect(invalid).rejects.toThrow('Invalid feedback request.');
  });
});
