import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type { CalendarDay } from '../domain/calendar.js';
import type { LearnerProfile } from '../domain/engagement.js';
import type { EngagementRepository } from '../domain/ports/engagement-repository.js';
import { lockProfile } from './engagement-locks.js';
import {
  dayDate,
  dayKey,
  toAchievement,
  toProfile,
} from './engagement-rows.js';

export class PrismaEngagementRepository implements EngagementRepository {
  constructor(private readonly db: PrismaService) {}

  async profile(userId: string) {
    const row = await this.db.learnerProfile.findUnique({ where: { userId } });

    return row ? toProfile(row) : null;
  }

  async studyDays(userId: string, from: CalendarDay) {
    const rows = await this.db.studyDay.findMany({
      where: { userId, day: { gte: dayDate(from) } },
      select: { day: true },
    });

    return rows.map((row) => dayKey(row.day));
  }

  async achievements(userId: string) {
    const rows = await this.db.achievement.findMany({
      where: { userId },
      orderBy: [{ awardedAt: 'desc' }, { roadmapId: 'asc' }],
    });

    return rows.map(toAchievement);
  }

  writeTimeZone(
    userId: string,
    change: (current: LearnerProfile | null) => string | null,
    now: Date,
  ) {
    return this.db.$transaction(async (tx) => {
      const profile = await lockProfile(tx, userId);

      const timeZone = change(profile);
      if (timeZone === null) {
        return profile;
      }

      const row = await tx.learnerProfile.update({
        where: { userId },
        data: { timeZone, updatedAt: now },
      });

      return toProfile(row);
    });
  }
}
