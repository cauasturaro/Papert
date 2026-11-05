import { communityHarness } from './support/community.js';
import { DEFAULT_ROADMAP_ID } from '../src/study/domain/default-roadmap.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Community library-start HTTP + PostgreSQL',
  () => {
    const context = communityHarness();
    const { api, learner, generated, publish } = context;

    it('saves references in the library without copying or changing authorship', async () => {
      const reader = await learner();
      await api('get', '/community/roadmaps', reader.cookie).expect(200);

      const before = await context.db.roadmap.count();

      await api(
        'put',
        `/community/library/${DEFAULT_ROADMAP_ID}`,
        reader.cookie,
      )
        .send({})
        .expect(200);
      await api(
        'put',
        `/community/library/${DEFAULT_ROADMAP_ID}`,
        reader.cookie,
      )
        .send({})
        .expect(200);
      await api(
        'put',
        '/community/library/not-published-anywhere',
        reader.cookie,
      )
        .send({})
        .expect(404);

      const saved = await api(
        'get',
        '/community/library',
        reader.cookie,
      ).expect(200);
      const entries = await context.db.libraryEntry.count({
        where: { userId: reader.userId },
      });
      const roadmap = await context.db.roadmap.findUniqueOrThrow({
        where: { id: DEFAULT_ROADMAP_ID },
      });

      expect(saved.body).toHaveLength(1);
      expect(saved.body[0]).toMatchObject({
        id: DEFAULT_ROADMAP_ID,
        favorited: true,
      });
      expect(entries).toBe(1);
      expect(await context.db.roadmap.count()).toBe(before);
      expect(roadmap).toMatchObject({
        authorName: 'Papert',
        authorUserId: null,
      });

      await api(
        'delete',
        `/community/library/${DEFAULT_ROADMAP_ID}`,
        reader.cookie,
      )
        .send({})
        .expect(200);
      await api(
        'delete',
        `/community/library/${DEFAULT_ROADMAP_ID}`,
        reader.cookie,
      )
        .send({})
        .expect(200);

      const empty = await api(
        'get',
        '/community/library',
        reader.cookie,
      ).expect(200);

      expect(empty.body).toEqual([]);
    });

    it('gives each learner of a community roadmap their own files, sources and progress', async () => {
      const alice = await learner();
      const bob = await learner();
      const published = await generated(alice.userId, 'Adapters last.');
      const unpublished = await generated(alice.userId, 'Never shared.');
      await publish(alice.cookie, published.roadmapId).expect(200);

      const started = await api(
        'post',
        `/community/roadmaps/${published.roadmapId}/start`,
        bob.cookie,
      )
        .send({})
        .expect(200);
      const again = await api(
        'post',
        `/community/roadmaps/${published.roadmapId}/start`,
        bob.cookie,
      )
        .send({})
        .expect(200);
      const bobWorkspace = started.body.workspaceId;

      expect(again.body.workspaceId).toBe(bobWorkspace);
      expect(bobWorkspace).not.toBe(published.workspaceId);

      await context.db.workspace.update({
        where: { id: published.workspaceId },
        data: { currentStep: 2 },
      });

      const resumed = await api(
        'post',
        `/study/roadmaps/${published.roadmapId}/start`,
        bob.cookie,
      )
        .send({})
        .expect(200);

      expect(resumed.body).toMatchObject({ id: bobWorkspace, currentStep: 0 });
      expect(resumed.body.files).toEqual({
        'src/reservation.ts': 'export {};\n',
      });

      const bobSources = await api(
        'get',
        `/study/workspaces/${bobWorkspace}/sources`,
        bob.cookie,
      ).expect(200);

      expect(bobSources.body).toEqual([]);
      await api(
        'get',
        `/study/workspaces/${published.workspaceId}`,
        bob.cookie,
      ).expect(404);
      await api(
        'get',
        `/study/workspaces/${published.workspaceId}/sources`,
        bob.cookie,
      ).expect(404);

      await api(
        'post',
        `/community/roadmaps/${unpublished.roadmapId}/start`,
        bob.cookie,
      )
        .send({})
        .expect(404);
      await api(
        'post',
        `/study/roadmaps/${unpublished.roadmapId}/start`,
        bob.cookie,
      )
        .send({})
        .expect(404);

      const home = await api('get', '/study/roadmaps', bob.cookie).expect(200);

      expect(
        home.body.map((item: { roadmap: { id: string } }) => item.roadmap.id),
      ).toEqual([published.roadmapId]);
    });
  },
);
