import { describe, expect, it } from 'vitest';
import {
  assertRateable,
  feedbackChange,
  pendingDelivery,
  retryAt,
  type AnswerFeedback,
} from './feedback.js';

const stored: AnswerFeedback = {
  executionId: '7c0e1b0e-3f39-4a55-9f35-a3f1d4b9a2c1',
  rating: 'down',
  cleared: false,
  hallucination: false,
  revision: 2,
  deliveredRevision: 2,
  deliveryAttempts: 0,
  nextDeliveryAt: null,
  updatedAt: new Date('2026-11-05T10:00:00Z'),
};

describe('assertRateable', () => {
  it('accepts finished tutor answers and evaluations', () => {
    expect(() =>
      assertRateable({ kind: 'chat', status: 'completed' }),
    ).not.toThrow();
    expect(() =>
      assertRateable({ kind: 'analysis', status: 'completed' }),
    ).not.toThrow();
  });

  it('rejects unfinished, failed and unrated kinds', () => {
    expect(() => assertRateable({ kind: 'chat', status: 'running' })).toThrow(
      'Only finished answers can be rated.',
    );
    expect(() => assertRateable({ kind: 'chat', status: 'failed' })).toThrow(
      'Only finished answers can be rated.',
    );
    expect(() =>
      assertRateable({ kind: 'generation', status: 'completed' }),
    ).toThrow('This result cannot be rated.');
  });
});

describe('feedbackChange', () => {
  it('starts at revision 1', () => {
    const change = feedbackChange(null, { rating: 'up', hallucination: false });

    expect(change).toEqual({ rating: 'up', hallucination: false, revision: 1 });
  });

  it('adds a revision when the verdict changes', () => {
    const report = feedbackChange(stored, {
      rating: 'down',
      hallucination: true,
    });
    const flip = feedbackChange(stored, { rating: 'up', hallucination: false });

    expect(report?.revision).toBe(3);
    expect(flip?.revision).toBe(3);
  });

  it('ignores a repeated verdict', () => {
    expect(
      feedbackChange(stored, { rating: 'down', hallucination: false }),
    ).toBeNull();
  });

  it('requires a thumbs down with a hallucination report', () => {
    expect(() =>
      feedbackChange(null, { rating: 'up', hallucination: true }),
    ).toThrow('Reporting a hallucination also rates the answer down.');
  });
});

describe('delivery', () => {
  it('is pending until the latest revision was received', () => {
    expect(pendingDelivery(stored)).toBe(false);
    expect(pendingDelivery({ ...stored, revision: 3 })).toBe(true);
  });

  it('retries exponentially up to an hour', () => {
    const now = new Date('2026-11-05T10:00:00Z');

    expect(retryAt(1, now).toISOString()).toBe('2026-11-05T10:02:00.000Z');
    expect(retryAt(3, now).toISOString()).toBe('2026-11-05T10:08:00.000Z');
    expect(retryAt(12, now).toISOString()).toBe('2026-11-05T11:00:00.000Z');
  });
});
