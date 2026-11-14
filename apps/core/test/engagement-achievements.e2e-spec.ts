import { engagementHarness } from './support/engagement.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Engagement achievements',
  () => {
    const context = engagementHarness();

    async function complete(
      learner: Awaited<ReturnType<typeof context.student>>,
    ) {
      const initial = await context.workspace(
        learner.cookie,
        learner.workspaceId,
      );
      let event;

      for (const _step of initial.roadmap.definition.steps) {
        event = await context.attempt(learner, true);
      }

      return { initial, event: event! };
    }

    it('awards official completion with the same progress as Study', async () => {
      const learner = await context.student();

      const { initial } = await complete(learner);
      const view = await context
        .api('get', '/engagement', learner.cookie)
        .expect(200);
      const workspace = await context.workspace(
        learner.cookie,
        learner.workspaceId,
      );
      const achievements = await context.db.achievement.findMany({
        where: { userId: learner.userId },
      });

      expect(achievements).toHaveLength(1);
      expect(view.body.achievements).toEqual([
        expect.objectContaining({
          roadmapId: initial.roadmap.id,
          title: initial.roadmap.definition.title,
          stepCount: initial.roadmap.definition.steps.length,
        }),
      ]);
      expect(view.body.roadmaps).toContainEqual(
        expect.objectContaining({
          workspaceId: learner.workspaceId,
          completed: true,
          achieved: true,
          completedSteps: workspace.currentStep,
          totalSteps: workspace.currentStep,
        }),
      );
    });

    it('ignores redelivery and a duplicate claim after completion', async () => {
      const learner = await context.student();
      const { event } = await complete(learner);
      const before = await context.db.studyDay.findMany({
        where: { userId: learner.userId },
      });
      const profile = await context.db.learnerProfile.findUnique({
        where: { userId: learner.userId },
      });

      await context.worker.accept(event);
      await context.worker.claim(event.executionId);
      await context.worker.accept(event);

      expect(
        await context.db.studyDay.findMany({
          where: { userId: learner.userId },
        }),
      ).toEqual(before);
      expect(
        await context.db.learnerProfile.findUnique({
          where: { userId: learner.userId },
        }),
      ).toEqual(profile);
      expect(
        await context.db.achievement.count({
          where: { userId: learner.userId },
        }),
      ).toBe(1);
    });

    it('does not award or advance a needs_work last step', async () => {
      const learner = await context.student();
      const initial = await context.workspace(
        learner.cookie,
        learner.workspaceId,
      );
      const lastIndex = initial.roadmap.definition.steps.length - 1;
      for (let index = 0; index < lastIndex; index++) {
        await context.attempt(learner, true);
      }

      await context.attempt(learner);

      const workspace = await context.workspace(
        learner.cookie,
        learner.workspaceId,
      );

      expect(workspace.currentStep).toBe(lastIndex);
      expect(workspace.attempts[0].result.status).toBe('needs_work');
      expect(
        await context.db.achievement.count({
          where: { userId: learner.userId },
        }),
      ).toBe(0);
    });

    it.each(['verdict', 'attemptId', 'revision', 'criterion'])(
      'rejects tampered %s without activity or progress',
      async (field) => {
        const learner = await context.student();

        await context.attempt(learner, true, (payload) => {
          if (field === 'verdict') {
            return { ...payload, verdict: 'approved' };
          }
          if (field === 'attemptId') {
            return { ...payload, attemptId: learner.workspaceId };
          }
          if (field === 'revision') {
            return { ...payload, revision: payload.revision + 1 };
          }

          return { ...payload, criteria: payload.criteria.slice(1) };
        });

        const workspace = await context.workspace(
          learner.cookie,
          learner.workspaceId,
        );

        expect(workspace.currentStep).toBe(0);
        expect(workspace.attempts[0].result.status).toBe('analysis_failed');
        expect(
          await context.db.studyDay.count({
            where: { userId: learner.userId },
          }),
        ).toBe(0);
        expect(
          await context.db.achievement.count({
            where: { userId: learner.userId },
          }),
        ).toBe(0);
      },
    );

    it('isolates another learner from completed achievements and study days', async () => {
      const alice = await context.student();
      const bob = await context.student();
      await complete(alice);

      const view = await context
        .api('get', '/engagement', bob.cookie)
        .expect(200);

      expect(view.body.achievements).toEqual([]);
      expect(view.body.streak.current).toBe(0);
      expect(view.body.streak.recent).toHaveLength(14);
      expect(
        view.body.streak.recent.every(
          (day: { studied: boolean }) => !day.studied,
        ),
      ).toBe(true);
      expect(view.body.roadmaps).not.toContainEqual(
        expect.objectContaining({ workspaceId: alice.workspaceId }),
      );
    });
  },
);
