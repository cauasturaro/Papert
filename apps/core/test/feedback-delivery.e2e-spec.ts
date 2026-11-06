import { feedbackHarness } from './support/feedback.js';

const up = { rating: 'up', hallucination: false };
const down = { rating: 'down', hallucination: false };
const hallucination = { rating: 'down', hallucination: true };

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Feedback delivery + PostgreSQL',
  () => {
    const harness = feedbackHarness();

    it('retries failed delivery after two minutes and clears its schedule', async () => {
      const alice = await harness.student();
      const execution = await harness.completed(alice);
      harness.failing = true;
      const retryAt = new Date(harness.context.now.getTime() + 120_000);

      const rated = await harness.service.rate(
        alice.userId,
        execution.id,
        down,
      );

      expect(rated.delivered).toBe(false);
      expect(await harness.service.list(alice.userId, execution.id)).toEqual([
        rated,
      ]);
      expect(await harness.stored(execution.id)).toMatchObject({
        deliveryAttempts: 1,
        nextDeliveryAt: retryAt,
        deliveredRevision: 0,
      });
      expect(harness.signals).toEqual([]);

      harness.failing = false;
      harness.advance(119_999);
      const early = await harness.service.deliverDue();

      expect(early).toEqual({ claimed: 0, delivered: 0 });
      expect(harness.signals).toEqual([]);

      harness.advance(2);
      const retried = await harness.service.deliverDue();

      expect(retried).toEqual({ claimed: 1, delivered: 1 });
      expect(harness.signals).toEqual([
        { executionId: execution.id, ...down, revision: 1 },
      ]);
      expect(await harness.stored(execution.id)).toMatchObject({
        deliveryAttempts: 0,
        deliveredRevision: 1,
        nextDeliveryAt: null,
      });
    });

    it('claims one pending revision only once across concurrent delivery calls', async () => {
      const alice = await harness.student();
      const execution = await harness.completed(alice);
      harness.failing = true;
      await harness.service.rate(alice.userId, execution.id, down);
      harness.failing = false;
      harness.advance(120_001);

      const results = await Promise.all([
        harness.service.deliverDue(),
        harness.service.deliverDue(),
      ]);

      expect(
        results
          .map((result) => result.claimed)
          .sort((left, right) => left - right),
      ).toEqual([0, 1]);
      expect(
        results
          .map((result) => result.delivered)
          .sort((left, right) => left - right),
      ).toEqual([0, 1]);
      expect(harness.signals).toEqual([
        { executionId: execution.id, ...down, revision: 1 },
      ]);
      expect(await harness.stored(execution.id)).toMatchObject({
        deliveredRevision: 1,
        nextDeliveryAt: null,
      });
    });

    it('preserves an in-flight claim and delivers the newest verdict after expiry', async () => {
      const alice = await harness.student();
      const execution = await harness.completed(alice);
      harness.failing = true;
      await harness.service.rate(alice.userId, execution.id, up);
      harness.advance(120_001);
      const claimUntil = new Date(harness.context.now.getTime() + 60_000);
      const claimed = await harness.repository.claimDue(
        harness.context.now,
        claimUntil,
        1,
        execution.id,
      );
      harness.failing = false;

      const updated = await harness.service.rate(
        alice.userId,
        execution.id,
        hallucination,
      );

      expect(claimed).toMatchObject([
        { revision: 1, nextDeliveryAt: claimUntil },
      ]);
      expect(updated).toMatchObject({ ...hallucination, delivered: false });
      expect(await harness.stored(execution.id)).toMatchObject({
        revision: 2,
        nextDeliveryAt: claimUntil,
      });
      expect(harness.signals).toEqual([]);
      expect(await harness.service.deliverDue()).toEqual({
        claimed: 0,
        delivered: 0,
      });

      harness.advance(60_001);
      const delivered = await harness.service.deliverDue();

      expect(delivered).toEqual({ claimed: 1, delivered: 1 });
      expect(harness.signals).toEqual([
        { executionId: execution.id, ...hallucination, revision: 2 },
      ]);
      expect(await harness.stored(execution.id)).toMatchObject({
        revision: 2,
        deliveredRevision: 2,
        nextDeliveryAt: null,
      });
    });
  },
);
