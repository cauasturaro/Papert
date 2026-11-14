import { addDays, daysBetween, localDay } from './calendar.js';
import type { CalendarDay } from './calendar.js';
import type { StreakRecord } from './engagement.js';

export const RECENT_DAYS = 14;

/** `studied`: today counts; `pending`: yesterday counted and today keeps it; `broken`/`none`: 0. */
export type StreakStatus = 'studied' | 'pending' | 'broken' | 'none';

export type StreakView = {
  current: number;
  longest: number;
  lastStudyDay: CalendarDay | null;
  status: StreakStatus;
};

export type RecentDay = { day: CalendarDay; studied: boolean };

export type StudyDayChange = {
  // The day the activity is recorded on; never earlier than the last recorded day.
  day: CalendarDay;
  // False when that day was already counted, so the counters stay as they are.
  newDay: boolean;
  streak: StreakRecord;
};

/** The day an evaluated analysis counts for, dated in the learner's zone at that moment. */
export function activityDay(
  evaluatedAt: Date,
  timeZone: string,
  record: StreakRecord | null,
): CalendarDay {
  const day = localDay(evaluatedAt, timeZone);
  const last = record?.lastStudyDay;

  // A zone change westwards can produce an earlier date; days never move backwards.
  if (last && daysBetween(last, day) < 0) {
    return last;
  }

  return day;
}

export function studyDayChange(
  record: StreakRecord | null,
  day: CalendarDay,
): StudyDayChange {
  const last = record?.lastStudyDay ?? null;

  if (record && last === day) {
    return { day, newDay: false, streak: record };
  }

  const continues = last !== null && daysBetween(last, day) === 1;
  const currentStreak = continues ? (record?.currentStreak ?? 0) + 1 : 1;
  const longestStreak = Math.max(record?.longestStreak ?? 0, currentStreak);

  return {
    day,
    newDay: true,
    streak: { currentStreak, longestStreak, lastStudyDay: day },
  };
}

/**
 * The streak as of `today`. The stored count is only refreshed on study days, so a streak whose
 * last day is before yesterday reads as broken (0) while its longest count is kept.
 */
export function streakView(
  record: StreakRecord | null,
  today: CalendarDay,
): StreakView {
  const longest = record?.longestStreak ?? 0;
  const last = record?.lastStudyDay ?? null;

  if (!record || last === null) {
    return { current: 0, longest, lastStudyDay: null, status: 'none' };
  }

  const gap = daysBetween(last, today);

  let status: StreakStatus = 'broken';
  if (gap <= 0) {
    status = 'studied';
  } else if (gap === 1) {
    status = 'pending';
  }

  const current = status === 'broken' ? 0 : record.currentStreak;

  return { current, longest, lastStudyDay: last, status };
}

/** The last `count` days ending today, oldest first, marking those with a study day. */
export function recentDays(
  studied: CalendarDay[],
  today: CalendarDay,
  count = RECENT_DAYS,
): RecentDay[] {
  const days = new Set(studied);

  return Array.from({ length: count }, (_, index) => {
    const day = addDays(today, index - count + 1);

    return { day, studied: days.has(day) };
  });
}
