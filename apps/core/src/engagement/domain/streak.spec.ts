import { describe, expect, it } from 'vitest';
import {
  activityDay,
  recentDays,
  streakView,
  studyDayChange,
} from './streak.js';

const record = (
  currentStreak: number,
  longestStreak: number,
  last: string,
) => ({
  currentStreak,
  longestStreak,
  lastStudyDay: last,
});

describe('Study day changes', () => {
  it('starts a streak on the first study day', () => {
    const change = studyDayChange(null, '2026-11-06');

    expect(change).toEqual({
      day: '2026-11-06',
      newDay: true,
      streak: record(1, 1, '2026-11-06'),
    });
  });

  it('does not count a second activity on the same day', () => {
    const stored = record(3, 5, '2026-11-06');

    const change = studyDayChange(stored, '2026-11-06');

    expect(change).toEqual({
      day: '2026-11-06',
      newDay: false,
      streak: stored,
    });
  });

  it('extends the streak on the next day, also across a month end', () => {
    const nextDay = studyDayChange(record(3, 3, '2026-11-06'), '2026-11-07');
    const nextMonth = studyDayChange(record(1, 4, '2026-11-30'), '2026-12-01');

    expect(nextDay.streak).toEqual(record(4, 4, '2026-11-07'));
    expect(nextMonth.streak).toEqual(record(2, 4, '2026-12-01'));
  });

  it('restarts at one after a missed day and keeps the longest streak', () => {
    const change = studyDayChange(record(6, 9, '2026-11-04'), '2026-11-06');

    expect(change.streak).toEqual(record(1, 9, '2026-11-06'));
  });
});

describe('Activity day', () => {
  it('dates an analysis in the learner zone', () => {
    const lateEvening = new Date('2026-11-07T02:00:00Z');

    const day = activityDay(lateEvening, 'America/Sao_Paulo', null);

    expect(day).toBe('2026-11-06');
  });

  it('never moves before the last study day after a zone change westwards', () => {
    const stored = record(2, 2, '2026-11-07');
    const instant = new Date('2026-11-07T01:00:00Z');

    const day = activityDay(instant, 'America/Los_Angeles', stored);

    expect(day).toBe('2026-11-07');
    expect(studyDayChange(stored, day).newDay).toBe(false);
  });
});

describe('Streak view', () => {
  it('reports no streak before any study day', () => {
    expect(streakView(null, '2026-11-06')).toEqual({
      current: 0,
      longest: 0,
      lastStudyDay: null,
      status: 'none',
    });
  });

  it.each([
    ['2026-11-06', 'studied', 4],
    ['2026-11-07', 'pending', 4],
    ['2026-11-08', 'broken', 0],
  ] as const)('on %s reads as %s with %d days', (today, status, current) => {
    const view = streakView(record(4, 7, '2026-11-06'), today);

    expect(view).toEqual({
      current,
      longest: 7,
      lastStudyDay: '2026-11-06',
      status,
    });
  });

  it('lists the recent days oldest first, ending today', () => {
    const days = recentDays(
      ['2026-11-05', '2026-11-06', '2026-10-01'],
      '2026-11-06',
      3,
    );

    expect(days).toEqual([
      { day: '2026-11-04', studied: false },
      { day: '2026-11-05', studied: true },
      { day: '2026-11-06', studied: true },
    ]);
  });
});
