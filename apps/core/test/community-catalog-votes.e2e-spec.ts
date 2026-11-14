import { communityHarness } from './support/community.js';
import { DEFAULT_ROADMAP_ID } from '../src/study/domain/default-roadmap.js';
import { wilsonScore } from '../src/community/domain/ranking.js';
import { SHOWCASE_ROADMAPS } from '../src/study/domain/showcase-roadmaps.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Community catalog-votes HTTP + PostgreSQL',
  () => {
    const context = communityHarness();
    const { api, learner, generated, publish, vote } = context;

    it('seeds Papert roadmaps and searches, filters and pages the catalog', async () => {
      const reader = await learner();

      const all = await api('get', '/community/roadmaps', reader.cookie).expect(
        200,
      );
      const ids = all.body.items.map((item: { id: string }) => item.id);

      expect(all.body.total).toBeGreaterThanOrEqual(
        SHOWCASE_ROADMAPS.length + 1,
      );
      expect(all.body.pageSize).toBe(12);
      expect(new Set(ids).size).toBe(ids.length);
      expect(all.body.items[0]).toMatchObject({
        authorName: expect.any(String),
      });
      expect(all.body.items[0]).not.toHaveProperty('authorUserId');

      const fixture = await api(
        'get',
        `/community/roadmaps/${DEFAULT_ROADMAP_ID}`,
        reader.cookie,
      ).expect(200);

      expect(fixture.body).toMatchObject({ authorName: 'Papert', own: false });

      const hexagonal = await api(
        'get',
        '/community/roadmaps?q=hexagonal%20ports%20adapters%20nestjs',
        reader.cookie,
      ).expect(200);

      expect(hexagonal.body.items[0].id).toBe('hexagonal-architecture-nestjs');
      expect(hexagonal.body.items[0].authorName).toBe('Papert');
      expect(hexagonal.body.correctedQuery).toBeNull();

      const unfinished = await api(
        'get',
        '/community/roadmaps?q=hexag%20nest',
        reader.cookie,
      ).expect(200);

      expect(unfinished.body.items[0].id).toBe('hexagonal-architecture-nestjs');
      expect(unfinished.body.correctedQuery).toBeNull();

      const misspelled = await api(
        'get',
        '/community/roadmaps?q=hexagnoal',
        reader.cookie,
      ).expect(200);

      expect(misspelled.body.correctedQuery).toBe('hexagonal');
      expect(misspelled.body.items[0].id).toBe('hexagonal-architecture-nestjs');

      const byAuthor = await api(
        'get',
        '/community/roadmaps?q=papert',
        reader.cookie,
      ).expect(200);

      expect(byAuthor.body.total).toBeGreaterThanOrEqual(
        SHOWCASE_ROADMAPS.length,
      );

      const beginner = await api(
        'get',
        '/community/roadmaps?level=beginner&sort=new',
        reader.cookie,
      ).expect(200);
      const levels = new Set(
        beginner.body.items.map((item: { level: string }) => item.level),
      );

      expect([...levels]).toEqual(['beginner']);

      const nothing = await api(
        'get',
        '/community/roadmaps?q=sourdough%20starter%20hydration',
        reader.cookie,
      ).expect(200);

      expect(nothing.body).toMatchObject({
        items: [],
        total: 0,
        hasMore: false,
      });

      const beyond = await api(
        'get',
        '/community/roadmaps?page=50',
        reader.cookie,
      ).expect(200);

      expect(beyond.body.items).toEqual([]);

      await api('get', '/community/roadmaps?page=0', reader.cookie).expect(400);
      await api(
        'get',
        '/community/roadmaps?level=expert',
        reader.cookie,
      ).expect(400);
      await api('get', '/community/roadmaps').expect(401);
    });

    it('keeps vote counters consistent across changes, repeats and concurrent voters', async () => {
      const alice = await learner();
      const bob = await learner();
      const { roadmapId } = await generated(alice.userId, 'Ports first.');
      await publish(alice.cookie, roadmapId).expect(200);

      const up = await vote(bob.cookie, roadmapId, 1).expect(200);
      const repeated = await vote(bob.cookie, roadmapId, 1).expect(200);
      const switched = await vote(bob.cookie, roadmapId, -1).expect(200);
      const removed = await vote(bob.cookie, roadmapId, 0).expect(200);

      expect(up.body).toMatchObject({ upvotes: 1, downvotes: 0, myVote: 1 });
      expect(repeated.body).toMatchObject({ upvotes: 1, downvotes: 0 });
      expect(switched.body).toMatchObject({
        upvotes: 0,
        downvotes: 1,
        myVote: -1,
      });
      expect(removed.body).toMatchObject({
        upvotes: 0,
        downvotes: 0,
        myVote: 0,
      });

      await vote(alice.cookie, roadmapId, 1).expect(403);
      await vote(bob.cookie, roadmapId, 2).expect(400);
      await vote(bob.cookie, 'not-published-anywhere', 1).expect(404);

      const voters = await Promise.all([1, 2, 3, 4, 5].map(() => learner()));

      const responses = await Promise.all([
        ...voters.map((voter, index) =>
          vote(voter.cookie, roadmapId, index < 4 ? 1 : -1),
        ),
        ...voters.map((voter) => vote(voter.cookie, roadmapId, 1)),
        vote(bob.cookie, roadmapId, -1),
      ]);

      expect(responses.every((response) => response.status === 200)).toBe(true);

      const publication = await context.db.roadmapPublication.findUniqueOrThrow(
        {
          where: { roadmapId },
        },
      );
      const up5 = await context.db.roadmapVote.count({
        where: { roadmapId, value: 1 },
      });
      const down5 = await context.db.roadmapVote.count({
        where: { roadmapId, value: -1 },
      });

      expect(publication.upvotes).toBe(up5);
      expect(publication.downvotes).toBe(down5);
      expect(up5 + down5).toBe(6);
      expect(publication.score).toBeCloseTo(wilsonScore(up5, down5), 10);

      for (const voter of [bob, ...voters]) {
        await vote(voter.cookie, roadmapId, 0).expect(200);
      }

      const cleared = await context.db.roadmapPublication.findUniqueOrThrow({
        where: { roadmapId },
      });

      expect(cleared).toMatchObject({ upvotes: 0, downvotes: 0, score: 0 });
    });
  },
);
