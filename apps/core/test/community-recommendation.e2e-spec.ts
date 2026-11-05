import { communityHarness } from './support/community.js';
import { randomUUID } from 'node:crypto';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Community recommendation HTTP + PostgreSQL',
  () => {
    const context = communityHarness();
    const { api, learner, generated, publish } = context;

    it('recommends published roadmaps before a paid generation and needs the learner to choose', async () => {
      const alice = await learner();
      const carol = await learner();
      const theirs = await generated(alice.userId, 'Ports for reservations.');
      const own = await generated(carol.userId, 'Carol wrote this.');
      await publish(alice.cookie, theirs.roadmapId).expect(200);
      await publish(carol.cookie, own.roadmapId, 'Carol').expect(200);

      const created = await api('post', '/study/drafts', carol.cookie)
        .send({
          goal: 'Build a reservation API with ports',
          level: 'intermediate',
        })
        .expect(201);
      const workspaceId = created.body.workspaceId;

      const early = await api(
        'post',
        `/executions/workspaces/${workspaceId}`,
        carol.cookie,
      )
        .send({ requestKey: randomUUID(), kind: 'generation' })
        .expect(409);

      expect(early.body.message).toMatch(/community/i);

      const check = await api(
        'post',
        `/executions/workspaces/${workspaceId}`,
        carol.cookie,
      )
        .send({ requestKey: randomUUID(), kind: 'recommendation' })
        .expect(201);
      await api('post', `/executions/workspaces/${workspaceId}`, carol.cookie)
        .send({ requestKey: randomUUID(), kind: 'recommendation' })
        .expect(409);

      const execution = await context.db.execution.findUniqueOrThrow({
        where: { id: check.body.id },
      });
      const snapshot = execution.input as {
        candidates: { roadmapId: string }[];
      };
      const offered = snapshot.candidates.map((item) => item.roadmapId);

      expect(offered).toContain(theirs.roadmapId);
      expect(offered).toContain('hexagonal-architecture-nestjs');
      expect(offered).not.toContain(own.roadmapId);
      expect(JSON.stringify(snapshot)).not.toContain(alice.userId);

      const claim = await context.worker.claim(check.body.id);

      const recommendationEvent = {
        version: 1,
        executionId: check.body.id,
        lease: claim.lease!,
        index: 2,
        status: 'completed',
        text: '',
        tokens: 120,
        recommendation: {
          matches: [
            { roadmapId: 'invented-roadmap', similarity: 0.9 },
            { roadmapId: theirs.roadmapId, similarity: 0.71 },
            { roadmapId: own.roadmapId, similarity: 0.8 },
          ],
        },
      };

      await context.worker.accept(recommendationEvent);

      const ready = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        carol.cookie,
      ).expect(200);

      expect(ready.body.recommendation).toMatchObject({
        status: 'ready',
        declined: false,
        matches: [{ roadmapId: theirs.roadmapId, similarity: 0.71 }],
      });

      await api('post', `/executions/workspaces/${workspaceId}`, carol.cookie)
        .send({ requestKey: randomUUID(), kind: 'generation' })
        .expect(409);

      const cards = await api(
        'get',
        `/community/roadmaps/selection?ids=${theirs.roadmapId},invented-roadmap`,
        carol.cookie,
      ).expect(200);

      expect(cards.body.map((card: { id: string }) => card.id)).toEqual([
        theirs.roadmapId,
      ]);

      await api(
        'post',
        `/study/drafts/${workspaceId}/recommendation/decline`,
        carol.cookie,
      )
        .send({})
        .expect(200);

      await api('post', `/executions/workspaces/${workspaceId}`, carol.cookie)
        .send({ requestKey: randomUUID(), kind: 'generation' })
        .expect(201);

      const quota = await context.executions.quota(carol.userId);

      expect(quota.used).toBe(120);
    });
  },
);
