import { DomainError } from '../src/common/domain/domain-error.js';
import { feedbackHarness } from './support/feedback.js';

const up = { rating: 'up', hallucination: false };
const down = { rating: 'down', hallucination: false };
const hallucination = { rating: 'down', hallucination: true };

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Answer feedback + PostgreSQL',
  () => {
    const harness = feedbackHarness();

    it('stores revision one, sends it once and lists it as delivered', async () => {
      const alice = await harness.student();
      const execution = await harness.completed(alice);

      const rated = await harness.service.rate(alice.userId, execution.id, up);
      const listed = await harness.service.list(alice.userId, execution.id);

      expect(rated).toMatchObject({
        executionId: execution.id,
        ...up,
        delivered: true,
      });
      expect(listed).toEqual([rated]);
      expect(await harness.stored(execution.id)).toMatchObject({
        userId: alice.userId,
        revision: 1,
        deliveredRevision: 1,
      });
      expect(harness.signals).toEqual([
        { executionId: execution.id, ...up, revision: 1 },
      ]);
    });

    it('hides another learner’s execution without creating feedback', async () => {
      const alice = await harness.student();
      const bob = await harness.student();
      const execution = await harness.completed(alice);

      const rating = harness.service.rate(bob.userId, execution.id, up);

      await expect(rating).rejects.toBeInstanceOf(DomainError);
      await expect(rating).rejects.toMatchObject({ kind: 'not_found' });
      expect(await harness.service.list(bob.userId, execution.id)).toEqual([]);
      expect(await harness.stored(execution.id)).toBeNull();
      expect(harness.signals).toEqual([]);

      await harness.service.rate(alice.userId, execution.id, up);

      expect(await harness.service.list(bob.userId, execution.id)).toEqual([]);
    });

    it('clears only the owner’s verdict', async () => {
      const alice = await harness.student();
      const bob = await harness.student();
      const execution = await harness.completed(alice);
      await harness.service.rate(alice.userId, execution.id, down);

      const foreign = harness.service.clear(bob.userId, execution.id);

      await expect(foreign).rejects.toMatchObject({ kind: 'not_found' });
      expect(await harness.stored(execution.id)).not.toBeNull();

      await harness.service.clear(alice.userId, execution.id);

      expect(await harness.stored(execution.id)).toMatchObject({
        cleared: true,
      });
      expect(await harness.service.list(alice.userId, execution.id)).toEqual(
        [],
      );
    });

    it('rejects running and failed executions without storing feedback', async () => {
      const alice = await harness.student();
      const execution = await harness.memory.admit(alice);
      const built = harness.memory.services();
      const claim = await built.worker.claim(execution.id);

      expect(claim.status).toBe('running');
      await expect(
        harness.service.rate(alice.userId, execution.id, up),
      ).rejects.toMatchObject({ kind: 'conflict' });
      expect(await harness.stored(execution.id)).toBeNull();

      const failedEvent = harness.context.event(
        execution.id,
        claim.lease!,
        1,
        'failed',
      );
      await built.worker.accept(failedEvent);

      expect(
        await built.service.owned(alice.userId, execution.id),
      ).toMatchObject({ status: 'failed' });
      await expect(
        harness.service.rate(alice.userId, execution.id, up),
      ).rejects.toMatchObject({ kind: 'conflict' });
      expect(await harness.stored(execution.id)).toBeNull();
      expect(harness.signals).toEqual([]);
    });

    it('rejects an upvote with hallucination and unknown fields', async () => {
      const alice = await harness.student();
      const execution = await harness.completed(alice);
      const contradictoryVerdict = { rating: 'up', hallucination: true };
      const unknownField = { ...down, explanation: 'Unexpected field' };

      await expect(
        harness.service.rate(alice.userId, execution.id, contradictoryVerdict),
      ).rejects.toMatchObject({ kind: 'invalid' });
      await expect(
        harness.service.rate(alice.userId, execution.id, unknownField),
      ).rejects.toMatchObject({ kind: 'invalid' });

      expect(await harness.stored(execution.id)).toBeNull();
      expect(harness.signals).toEqual([]);
    });

    it('delivers changed verdicts in revision order and ignores repeats', async () => {
      const alice = await harness.student();
      const execution = await harness.completed(alice);

      await harness.service.rate(alice.userId, execution.id, up);
      await harness.service.rate(alice.userId, execution.id, down);
      await harness.service.rate(alice.userId, execution.id, hallucination);
      const repeated = await harness.service.rate(
        alice.userId,
        execution.id,
        hallucination,
      );

      expect(harness.signals).toEqual([
        { executionId: execution.id, ...up, revision: 1 },
        { executionId: execution.id, ...down, revision: 2 },
        { executionId: execution.id, ...hallucination, revision: 3 },
      ]);
      expect(repeated).toMatchObject({ ...hallucination, delivered: true });
      expect(await harness.stored(execution.id)).toMatchObject({
        revision: 3,
        deliveredRevision: 3,
      });
    });

    it('cascades feedback when its workspace is deleted', async () => {
      const alice = await harness.student();
      const execution = await harness.completed(alice);
      await harness.service.rate(alice.userId, execution.id, down);
      expect(await harness.stored(execution.id)).not.toBeNull();

      await harness.context.db.workspace.delete({
        where: { id: alice.workspaceId },
      });

      expect(await harness.stored(execution.id)).toBeNull();
      expect(await harness.service.list(alice.userId, execution.id)).toEqual(
        [],
      );
    });

    it('enforces the hallucination constraint directly in PostgreSQL', async () => {
      const alice = await harness.student();
      const execution = await harness.completed(alice);
      await harness.service.rate(alice.userId, execution.id, down);

      const invalidUpdate = harness.context.db.$executeRaw`
        UPDATE core.answer_feedback
        SET hallucination = true, rating = 'up'
        WHERE execution_id = ${execution.id}::uuid
      `;

      await expect(invalidUpdate).rejects.toMatchObject({
        code: 'P2010',
        meta: { driverAdapterError: { cause: { code: '23514' } } },
      });
      expect(await harness.stored(execution.id)).toMatchObject(down);
    });

    it('accepts a completed analysis and rejects a completed recommendation', async () => {
      const alice = await harness.student();
      const analysis = await harness.analysis(alice);
      const recommendation = await harness.recommendation(alice);

      expect(await harness.memory.storedExecution(analysis.id)).toMatchObject({
        input: { kind: 'analysis' },
        status: 'completed',
      });
      expect(
        await harness.memory.storedExecution(recommendation.id),
      ).toMatchObject({
        input: { kind: 'recommendation' },
        status: 'completed',
      });

      const rated = await harness.service.rate(alice.userId, analysis.id, up);
      const rejected = harness.service.rate(
        alice.userId,
        recommendation.id,
        up,
      );

      expect(rated.delivered).toBe(true);
      await expect(rejected).rejects.toMatchObject({ kind: 'conflict' });
      expect(await harness.stored(recommendation.id)).toBeNull();
      expect(harness.signals).toEqual([
        { executionId: analysis.id, ...up, revision: 1 },
      ]);
    });
  },
);
