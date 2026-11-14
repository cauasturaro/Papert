import type { Prisma } from '@prisma/client';
import { analysisActivity } from '../domain/activity.js';
import type { EvaluatedAnalysis } from '../domain/engagement.js';
import type {
  AnalysisActivity,
  EngagementTransaction,
} from '../domain/ports/analysis-activity.js';
import { lockProfile } from './engagement-locks.js';
import { dayDate } from './engagement-rows.js';

type Transaction = Prisma.TransactionClient;

/** Executions' engagement participant; runs in the settlement transaction after Study's writes. */
export class PrismaAnalysisActivity implements AnalysisActivity {
  async recordAnalysis(
    context: EngagementTransaction,
    analysis: EvaluatedAnalysis,
  ) {
    const tx = context as Transaction;
    const { userId } = analysis;

    // The profile lock serializes analyses finishing at once in different workspaces.
    const profile = await lockProfile(tx, userId);
    const plan = analysisActivity(profile, analysis);

    await tx.studyDay.upsert({
      where: { userId_day: { userId, day: dayDate(plan.day) } },
      create: {
        userId,
        day: dayDate(plan.day),
        timeZone: plan.timeZone,
        firstExecutionId: analysis.executionId,
        firstAt: analysis.evaluatedAt,
      },
      update: { analyses: { increment: 1 } },
    });

    if (plan.streak) {
      await tx.learnerProfile.update({
        where: { userId },
        data: {
          currentStreak: plan.streak.currentStreak,
          longestStreak: plan.streak.longestStreak,
          lastStudyDay: dayDate(plan.day),
          updatedAt: analysis.evaluatedAt,
        },
      });
    }

    if (plan.achievement) {
      // One badge per learner and roadmap, even if the completion were reported twice.
      await tx.achievement.createMany({
        data: { userId, ...plan.achievement },
        skipDuplicates: true,
      });
    }
  }
}
