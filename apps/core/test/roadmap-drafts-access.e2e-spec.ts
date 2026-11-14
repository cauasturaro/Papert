import { randomUUID } from 'node:crypto';
import { roadmapDraftsHarness } from './support/roadmap-drafts.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Roadmap drafts HTTP + PostgreSQL',
  () => {
    const context = roadmapDraftsHarness();
    const { api, learner, draft, generate } = context;

    it('authorizes drafts, validates the goal, caps active drafts and keeps them out of study', async () => {
      const alice = await learner();
      const bob = await learner();

      await api('post', '/study/drafts')
        .send({ goal: 'x'.repeat(20), level: 'beginner' })
        .expect(401);
      await api('post', '/study/drafts', alice.cookie)
        .send({ goal: 'short', level: 'beginner' })
        .expect(400);
      await api('post', '/study/drafts', alice.cookie)
        .send({ goal: 'A valid learning goal', level: 'expert' })
        .expect(400);

      const workspaceId = await draft(alice.cookie);

      await api('get', `/study/drafts/${workspaceId}`, bob.cookie).expect(404);
      await api('delete', `/study/drafts/${workspaceId}`, bob.cookie)
        .send({})
        .expect(404);
      await generate(bob.cookie, workspaceId).expect(404);

      // A draft workspace has no roadmap, so it cannot be studied or evaluated yet.
      await api('get', `/study/workspaces/${workspaceId}`, alice.cookie).expect(
        404,
      );
      await api('post', `/executions/workspaces/${workspaceId}`, alice.cookie)
        .send({
          requestKey: randomUUID(),
          revision: 0,
          kind: 'chat',
          prompt: 'Hi',
        })
        .expect(409);

      await draft(alice.cookie);
      await draft(alice.cookie);
      await api('post', '/study/drafts', alice.cookie)
        .send({ goal: 'A fourth learning goal', level: 'beginner' })
        .expect(409);

      const listed = await api('get', '/study/drafts', alice.cookie).expect(
        200,
      );
      const others = await api('get', '/study/drafts', bob.cookie).expect(200);

      expect(listed.body).toHaveLength(3);
      expect(others.body).toEqual([]);
    });
  },
);
