import { communityHarness } from './support/community.js';
import { DEFAULT_ROADMAP_ID } from '../src/study/domain/default-roadmap.js';
const PRIVATE_FILENAME = 'team-conventions.md';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Community publication HTTP + PostgreSQL',
  () => {
    const context = communityHarness();
    const { api, learner, generated, publish } = context;

    it('publishes only explicitly, once, by the author and without private references', async () => {
      const alice = await learner();
      const bob = await learner();
      await api('get', '/community/roadmaps', bob.cookie).expect(200);

      const clean = await generated(
        alice.userId,
        'Separate rules from adapters.',
      );
      const leaking = await generated(
        alice.userId,
        `Follow the folders described in ${PRIVATE_FILENAME}.`,
      );

      await api(
        'get',
        `/community/roadmaps/${clean.roadmapId}`,
        bob.cookie,
      ).expect(404);
      await publish(bob.cookie, clean.roadmapId).expect(403);
      await publish(bob.cookie, DEFAULT_ROADMAP_ID).expect(403);
      await publish(alice.cookie, clean.roadmapId, 'Papert official').expect(
        400,
      );
      await api(
        'post',
        `/community/roadmaps/${clean.roadmapId}/publish`,
        alice.cookie,
      )
        .send({ authorName: 'Ana Dev', acknowledged: false })
        .expect(400);

      const refused = await publish(alice.cookie, leaking.roadmapId).expect(
        409,
      );

      expect(refused.body.message).toMatch(/private sources/);
      await api(
        'get',
        `/community/roadmaps/${leaking.roadmapId}`,
        bob.cookie,
      ).expect(404);

      const first = await publish(
        alice.cookie,
        clean.roadmapId,
        'Ana Dev',
      ).expect(200);
      const repeated = await publish(
        alice.cookie,
        clean.roadmapId,
        'Another Name',
      ).expect(200);
      const count = await context.db.roadmapPublication.count({
        where: { roadmapId: clean.roadmapId },
      });

      expect(first.body).toMatchObject({
        roadmapId: clean.roadmapId,
        authorName: 'Ana Dev',
      });
      expect(repeated.body.authorName).toBe('Ana Dev');
      expect(count).toBe(1);

      const details = await api(
        'get',
        `/community/roadmaps/${clean.roadmapId}`,
        bob.cookie,
      ).expect(200);
      const exposed = JSON.stringify(details.body);

      expect(details.body).toMatchObject({ authorName: 'Ana Dev', own: false });
      expect(details.body.starterFiles).toEqual(['src/reservation.ts']);
      for (const secret of [
        alice.userId,
        alice.email,
        clean.workspaceId,
        clean.sourceId,
        PRIVATE_FILENAME,
        'Build a reservation API with ports',
        'export const mine',
      ]) {
        expect(exposed).not.toContain(secret);
      }

      const mine = await api(
        'get',
        '/community/publications',
        alice.cookie,
      ).expect(200);

      expect(
        mine.body.map((item: { roadmapId: string }) => item.roadmapId),
      ).toEqual([clean.roadmapId]);

      // The roadmap itself never changes when published.
      const stored = await context.db.roadmap.findUniqueOrThrow({
        where: { id: clean.roadmapId },
      });

      expect(stored).toMatchObject({
        authorName: 'Papert learner',
        authorUserId: alice.userId,
      });
    });
  },
);
