import { ParserSyntaxChecker } from '../src/analysis/infrastructure/parser-syntax-checker.js';
import {
  executionsHarness,
  noCatalog,
  noSources,
} from './support/executions-http.js';
import { createExecutions } from './support/executions.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Executions HTTP + PostgreSQL',
  () => {
    const context = executionsHarness();
    const { student, payload, event, queue } = context;

    it('recovers the persist/publish gap and tolerates delivery after publish acknowledgement is lost', async () => {
      const alice = await student();

      queue.publish.mockRejectedValueOnce(new Error('SQS unavailable'));

      const created = await context.service.create(
        alice.userId,
        alice.workspaceId,
        payload(),
      );

      expect(
        (
          await context.db.execution.findUniqueOrThrow({
            where: { id: created.id },
          })
        ).publishedAt,
      ).toBeNull();

      const recovered = await context.service.sweep();

      expect(recovered.published).toBe(1);
      expect(queue.publish).toHaveBeenCalledTimes(2);

      const first = await context.worker.claim(created.id);
      const duplicate = await context.worker.claim(created.id);

      expect(first.status).toBe('running');
      expect(duplicate.status).toBe('busy');
      expect((await context.service.quota(alice.userId)).used).toBe(1000);
    });

    it('persists incremental snapshots, fences old attempts and settles a result once across duplicate/out-of-order deliveries', async () => {
      const alice = await student();

      const created = await context.service.create(
        alice.userId,
        alice.workspaceId,
        payload(),
      );
      const first = await context.worker.claim(created.id);

      const progress = await context.worker.accept(
        event(created.id, first.lease!, 1, 'running', 0),
      );

      expect(progress.status).toBe('running');
      expect(progress.firstEventAt).not.toBeNull();
      expect(progress.finishedAt).toBeNull();

      context.now = new Date(context.now.getTime() + 61000);
      const retry = await context.worker.claim(created.id);

      await context.worker.accept(event(created.id, first.lease!, 99));

      expect(
        (await context.service.owned(alice.userId, created.id)).status,
      ).toBe('running');

      const final = await context.worker.accept(
        event(created.id, retry.lease!, 3),
      );
      const duplicate = await context.worker.accept(
        event(created.id, retry.lease!, 3),
      );
      const older = await context.worker.accept(
        event(created.id, retry.lease!, 2, 'running'),
      );

      expect(duplicate).toEqual(final);
      expect(older).toEqual(final);
      expect(final).toMatchObject({
        status: 'completed',
        charged: 100,
        reserved: 0,
        text: 'Snapshot 3',
      });
      expect(await context.service.quota(alice.userId)).toMatchObject({
        used: 100,
        reserved: 0,
      });

      const restarted = createExecutions(
        context.db,
        queue,
        new ParserSyntaxChecker(),
        noSources,
        noCatalog,
        () => context.now,
      ).service;

      expect(
        restarted.snapshot(await restarted.owned(alice.userId, created.id)),
      ).toEqual(final);
      expect(
        (
          await context.db.workspace.findUniqueOrThrow({
            where: { id: alice.workspaceId },
          })
        ).currentStep,
      ).toBe(0);
    });
  },
);
