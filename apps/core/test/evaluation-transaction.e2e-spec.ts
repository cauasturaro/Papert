import { PrismaExecutionLifecycle } from '../src/executions/infrastructure/prisma-execution-lifecycle.js';
import { PrismaAttemptProgression } from '../src/study/infrastructure/prisma-attempt-progression.js';
import { PrismaRoadmapGeneration } from '../src/study/infrastructure/prisma-roadmap-generation.js';
import { PrismaRoadmapRecommendation } from '../src/study/infrastructure/prisma-roadmap-recommendation.js';
import { PrismaTutorMemory } from '../src/memory/infrastructure/prisma-tutor-memory.js';
import { PrismaAnalysisActivity } from '../src/engagement/infrastructure/prisma-analysis-activity.js';
import {
  FIRST_CRITERIA,
  evaluationHarness,
  met,
} from './support/evaluation.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Analysis, evaluation and progression',
  () => {
    const context = evaluationHarness();
    const { student, save, analyze, evaluation, workspace } = context;

    it('rolls back usage, attempt outcome and progression together when the study adapter fails', async () => {
      const alice = await student();

      const revision = await save(alice.cookie, alice.workspaceId, {
        'main.ts': 'export const value = 1;',
      });
      const admitted = await analyze(
        alice.cookie,
        alice.workspaceId,
        revision,
      ).expect(201);
      const claim = await context.worker.claim(admitted.body.id);
      const before = await context.db.execution.findUniqueOrThrow({
        where: { id: admitted.body.id },
      });
      const input = before.input as { attemptId: string };
      const quotaBefore = await context.db.executionQuota.findUniqueOrThrow({
        where: { id: before.quotaId },
      });
      const payload = evaluation(
        input.attemptId,
        revision,
        'validate-input',
        met(FIRST_CRITERIA),
      );
      const event = {
        version: 1 as const,
        executionId: before.id,
        lease: claim.lease!,
        index: 100,
        status: 'completed' as const,
        text: 'Analysis finished.',
        tokens: 900,
        evaluation: payload,
      };
      const progression = new PrismaAttemptProgression();
      const recordOutcome = progression.recordOutcome.bind(progression);
      vi.spyOn(progression, 'recordOutcome').mockImplementation(
        async (tx, execution, assess) => {
          await recordOutcome(tx, execution, assess);

          throw new Error('Study write interrupted');
        },
      );
      const failing = new PrismaExecutionLifecycle(
        context.db,
        undefined,
        progression,
        new PrismaRoadmapGeneration(),
        new PrismaRoadmapRecommendation(),
        new PrismaTutorMemory(context.db),
        new PrismaAnalysisActivity(),
      );

      await expect(
        failing.accept(event, null, { liveSourceIds: [], publishedIds: [] }),
      ).rejects.toThrow('Study write interrupted');

      const unchangedExecution = await context.db.execution.findUniqueOrThrow({
        where: { id: before.id },
      });
      const unchangedQuota = await context.db.executionQuota.findUniqueOrThrow({
        where: { id: before.quotaId },
      });
      const unchangedWorkspace = await workspace(
        alice.cookie,
        alice.workspaceId,
      );

      expect(unchangedExecution).toEqual(before);
      expect(unchangedQuota).toEqual(quotaBefore);
      expect(unchangedWorkspace.currentStep).toBe(0);
      expect(unchangedWorkspace.attempts[0].result).toMatchObject({
        status: 'evaluating',
        executionId: before.id,
      });

      await context.worker.accept(event);

      const completed = await workspace(alice.cookie, alice.workspaceId);

      expect(completed.currentStep).toBe(1);
      expect(completed.attempts[0].result.status).toBe('approved');
    });
  },
);
