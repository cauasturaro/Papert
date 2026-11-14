import { PrismaPublicationRepository } from '../src/community/infrastructure/prisma-publication-repository.js';
import { SHOWCASE_ROADMAPS } from '../src/study/domain/showcase-roadmaps.js';
import { communityHarness } from './support/community.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Community showcase vote before catalog reads',
  () => {
    const context = communityHarness();
    const { learner, vote } = context;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('seeds the showcase publication on the first vote in a fresh application', async () => {
      const seeding = vi.spyOn(
        PrismaPublicationRepository.prototype,
        'publishMany',
      );
      const voter = await learner();
      const roadmapId = SHOWCASE_ROADMAPS.at(-1)!.id;

      expect(seeding).not.toHaveBeenCalled();

      const voted = await vote(voter.cookie, roadmapId, 1).expect(200);

      expect(seeding).toHaveBeenCalledOnce();
      expect(voted.body).toMatchObject({ upvotes: 1, downvotes: 0, myVote: 1 });

      await vote(voter.cookie, roadmapId, 0).expect(200);
    });
  },
);
