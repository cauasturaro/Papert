import { DAILY_LIMIT, RESERVATION } from '../src/executions/domain/quota.js';
import { executionsHarness } from './support/executions-http.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Executions HTTP + PostgreSQL',
  () => {
    const context = executionsHarness();
    const { student, payload, queue } = context;

    it('serializes concurrent reservations and idempotency without overspending', async () => {
      const alice = await student();

      const same = payload();
      const duplicates = await Promise.all(
        Array.from({ length: 5 }, () =>
          context.service.create(alice.userId, alice.workspaceId, same),
        ),
      );

      expect(new Set(duplicates.map((job) => job.id)).size).toBe(1);
      expect((await context.service.quota(alice.userId)).reserved).toBe(3000);

      const submissions = await Promise.allSettled(
        Array.from({ length: 12 }, () =>
          context.service.create(alice.userId, alice.workspaceId, payload()),
        ),
      );

      expect(
        submissions.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(9);
      expect(await context.service.quota(alice.userId)).toMatchObject({
        used: 0,
        reserved: 10 * RESERVATION,
      });
      expect(
        await context.db.execution.count({ where: { userId: alice.userId } }),
      ).toBe(10);

      // The rate limit capped the burst; use up the rest of the day's quota directly.
      await context.db.executionQuota.updateMany({
        where: { userId: alice.userId },
        data: { used: DAILY_LIMIT - 10 * RESERVATION },
      });

      context.now = new Date('2026-11-02T12:01:01Z');
      const published = queue.publish.mock.calls.length;

      await expect(
        context.service.create(alice.userId, alice.workspaceId, payload()),
      ).rejects.toThrow('quota');
      expect(queue.publish.mock.calls).toHaveLength(published);

      context.now = new Date('2026-11-03T00:00:01Z');

      expect(await context.service.quota(alice.userId)).toMatchObject({
        period: '2026-11-03',
        reserved: 0,
      });

      await context.service.create(alice.userId, alice.workspaceId, payload());

      expect((await context.service.quota(alice.userId)).reserved).toBe(3000);
    });

    it('reserves only the attempts that fit the remaining quota', async () => {
      const alice = await student();

      await context.service.create(alice.userId, alice.workspaceId, payload());

      // With the first job's 3000 still reserved, 1500 remain: room for one 1000-token attempt.
      await context.db.executionQuota.updateMany({
        where: { userId: alice.userId },
        data: { used: DAILY_LIMIT - 4500 },
      });

      const job = await context.service.create(
        alice.userId,
        alice.workspaceId,
        payload(),
      );

      expect(job.reserved).toBe(1000);
      expect((await context.service.quota(alice.userId)).reserved).toBe(4000);
      await expect(
        context.service.create(alice.userId, alice.workspaceId, payload()),
      ).rejects.toThrow('quota');

      const claim = await context.worker.claim(job.id);
      const retry = await context.worker.failed(job.id, claim.lease!);

      expect(retry.status).toBe('failed');
      expect(await context.service.owned(alice.userId, job.id)).toMatchObject({
        status: 'failed',
        attempts: 1,
        reserved: 0,
      });
      expect(await context.service.quota(alice.userId)).toMatchObject({
        used: DAILY_LIMIT - 3500,
        reserved: 3000,
      });
    });
  },
);
