import type {
  Achievement as AchievementRow,
  LearnerProfile as ProfileRow,
} from '@prisma/client';
import type { CalendarDay } from '../domain/calendar.js';
import type { Achievement, LearnerProfile } from '../domain/engagement.js';

// PostgreSQL DATE values travel as UTC midnights.
export function dayDate(day: CalendarDay) {
  return new Date(`${day}T00:00:00Z`);
}

export function dayKey(date: Date): CalendarDay {
  return date.toISOString().slice(0, 10);
}

export function toProfile(row: ProfileRow): LearnerProfile {
  return {
    userId: row.userId,
    timeZone: row.timeZone,
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastStudyDay: row.lastStudyDay ? dayKey(row.lastStudyDay) : null,
  };
}

export function toAchievement(row: AchievementRow): Achievement {
  // The database CHECK allows only this kind; anything else is a schema drift.
  if (row.kind !== 'roadmap_completed') {
    throw new Error(`Unknown achievement kind ${row.kind}.`);
  }

  return {
    kind: row.kind,
    roadmapId: row.roadmapId,
    workspaceId: row.workspaceId,
    executionId: row.executionId,
    title: row.title,
    concepts: row.concepts,
    stepCount: row.stepCount,
    awardedAt: row.awardedAt,
  };
}
