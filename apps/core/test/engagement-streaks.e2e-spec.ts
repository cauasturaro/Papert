import { engagementHarness } from './support/engagement.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Engagement streaks',
  () => {
    const context = engagementHarness();

    async function days(userId: string) {
      return context.db.studyDay.findMany({
        where: { userId },
        orderBy: { day: 'asc' },
      });
    }

    it('counts three same-day revisions once and records all analyses', async () => {
      const learner = await context.student();
      context.at('2026-11-06T12:00:00Z');

      await context.attempt(learner);
      await context.attempt(learner);
      await context.attempt(learner, true);

      expect(await days(learner.userId)).toMatchObject([{ analyses: 3 }]);
      expect(
        await context.db.learnerProfile.findUniqueOrThrow({
          where: { userId: learner.userId },
        }),
      ).toMatchObject({ currentStreak: 1, longestStreak: 1 });
    });

    it('continues consecutive days, resets after a gap and reads pending or broken', async () => {
      const learner = await context.student();
      context.at('2026-11-06T12:00:00Z');
      await context.attempt(learner);

      context.at('2026-11-07T12:00:00Z');
      await context.attempt(learner);

      expect(
        await context.db.learnerProfile.findUniqueOrThrow({
          where: { userId: learner.userId },
        }),
      ).toMatchObject({ currentStreak: 2, longestStreak: 2 });

      context.at('2026-11-09T12:00:00Z');
      await context.attempt(learner);

      expect(
        await context.db.learnerProfile.findUniqueOrThrow({
          where: { userId: learner.userId },
        }),
      ).toMatchObject({ currentStreak: 1, longestStreak: 2 });

      context.at('2026-11-10T12:00:00Z');
      const pending = await context
        .api('get', '/engagement', learner.cookie)
        .expect(200);

      expect(pending.body.streak).toMatchObject({
        status: 'pending',
        current: 1,
        longest: 2,
      });

      context.at('2026-11-11T12:00:00Z');
      const broken = await context
        .api('get', '/engagement', learner.cookie)
        .expect(200);

      expect(broken.body.streak).toMatchObject({
        status: 'broken',
        current: 0,
        longest: 2,
      });
      expect(broken.body.streak.recent).toHaveLength(14);
    });

    it.each([
      ['America/Sao_Paulo', ['2026-11-06', '2026-11-07'], 2],
      [null, ['2026-11-07'], 1],
    ] as const)(
      'dates settlement in %s with UTC fallback',
      async (zone, expectedDays, streak) => {
        const learner = await context.student();
        if (zone) {
          await context
            .api('put', '/engagement/time-zone', learner.cookie)
            .send({ timeZone: zone })
            .expect(200);
        }

        context.at('2026-11-07T02:30:00Z');
        await context.attempt(learner);
        context.at('2026-11-07T03:30:00Z');
        await context.attempt(learner);

        const recorded = await days(learner.userId);

        expect(
          recorded.map((row) => row.day.toISOString().slice(0, 10)),
        ).toEqual(expectedDays);
        expect(
          await context.db.learnerProfile.findUniqueOrThrow({
            where: { userId: learner.userId },
          }),
        ).toMatchObject({ currentStreak: streak });
      },
    );

    it('does not move a study day backwards after a westward zone change', async () => {
      const learner = await context.student();
      context.at('2026-11-07T02:30:00Z');
      await context
        .api('put', '/engagement/time-zone', learner.cookie)
        .send({ timeZone: 'Asia/Tokyo' })
        .expect(200);
      await context.attempt(learner);

      await context
        .api('put', '/engagement/time-zone', learner.cookie)
        .send({ timeZone: 'America/Los_Angeles' })
        .expect(200);
      await context.attempt(learner);

      const recorded = await days(learner.userId);

      expect(recorded).toMatchObject([
        { analyses: 2, day: new Date('2026-11-07T00:00:00Z') },
      ]);
      expect(
        await context.db.learnerProfile.findUniqueOrThrow({
          where: { userId: learner.userId },
        }),
      ).toMatchObject({ currentStreak: 1, longestStreak: 1 });
    });
  },
);
