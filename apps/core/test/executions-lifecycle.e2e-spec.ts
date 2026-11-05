import { executionsHarness } from './support/executions-http.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Executions HTTP + PostgreSQL',
  () => {
    const context = executionsHarness();
    const { student, payload, event } = context;

    it('cancels before and during work, settles known late usage, and never publishes late text', async () => {
      const alice = await student();

      const queued = await context.service.create(
        alice.userId,
        alice.workspaceId,
        payload(),
      );

      await context.service.cancel(alice.userId, queued.id);

      expect((await context.worker.claim(queued.id)).status).toBe('cancelled');
      expect(await context.service.quota(alice.userId)).toMatchObject({
        used: 0,
        reserved: 0,
      });

      const running = await context.service.create(
        alice.userId,
        alice.workspaceId,
        payload(),
      );
      const claim = await context.worker.claim(running.id);

      await context.service.cancel(alice.userId, running.id);

      expect(await context.worker.active(running.id, claim.lease!)).toBe(false);

      const late = event(running.id, claim.lease!, 100, 'completed', 10);

      await context.worker.accept(late);
      await context.worker.accept(late);

      expect(await context.service.quota(alice.userId)).toMatchObject({
        used: 10,
        reserved: 0,
      });
      expect(
        await context.service.owned(alice.userId, running.id),
      ).toMatchObject({
        status: 'cancelled',
        text: '',
      });
    });

    it('bounds retries and ends permanent failure, while maintenance releases timed-out reservations', async () => {
      const alice = await student();

      const job = await context.service.create(
        alice.userId,
        alice.workspaceId,
        payload(),
      );

      for (let attempt = 0; attempt < 3; attempt++) {
        const claim = await context.worker.claim(job.id);

        await context.worker.failed(job.id, claim.lease!);
      }

      expect((await context.worker.claim(job.id)).status).toBe('failed');
      expect(await context.service.quota(alice.userId)).toMatchObject({
        used: 3000,
        reserved: 0,
      });

      const hanging = await context.service.create(
        alice.userId,
        alice.workspaceId,
        payload(),
      );
      const claim = await context.worker.claim(hanging.id);
      context.now = new Date(context.now.getTime() + 16 * 60000);
      await context.service.sweep();

      expect(
        await context.service.owned(alice.userId, hanging.id),
      ).toMatchObject({
        status: 'timed_out',
        charged: 1000,
        reserved: 0,
      });

      await context.worker.accept(
        event(hanging.id, claim.lease!, 100, 'completed', 0),
      );

      expect(await context.service.quota(alice.userId)).toMatchObject({
        used: 3000,
        reserved: 0,
      });
    });
  },
);
