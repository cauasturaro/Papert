import { describe, expect, it } from 'vitest';
import { analysisActivity } from './activity.js';

const evaluatedAt = new Date('2026-11-07T02:30:00Z');
const analysis = {
  userId: 'learner',
  executionId: 'execution',
  workspaceId: 'workspace',
  approved: false,
  evaluatedAt,
  completedRoadmap: null,
};
const profile = {
  userId: 'learner',
  timeZone: 'America/Sao_Paulo',
  currentStreak: 2,
  longestStreak: 4,
  lastStudyDay: '2026-11-05',
};

describe('Analysis activity plan', () => {
  it('extends the streak on a new day dated in the learner zone', () => {
    const plan = analysisActivity(profile, analysis);

    expect(plan).toEqual({
      day: '2026-11-06',
      timeZone: 'America/Sao_Paulo',
      streak: {
        currentStreak: 3,
        longestStreak: 4,
        lastStudyDay: '2026-11-06',
      },
      achievement: null,
    });
  });

  it('leaves the counters alone on a day already counted', () => {
    const counted = { ...profile, lastStudyDay: '2026-11-06' };

    const plan = analysisActivity(counted, analysis);

    expect(plan.streak).toBeNull();
    expect(plan.day).toBe('2026-11-06');
  });

  it('dates in UTC without a zone and carries the completion badge', () => {
    const completedRoadmap = {
      roadmapId: 'roadmap',
      workspaceId: 'workspace',
      title: 'Roadmap',
      stepCount: 2,
      concepts: [],
    };
    const completion = { ...analysis, approved: true, completedRoadmap };

    const plan = analysisActivity({ ...profile, timeZone: null }, completion);

    expect(plan.timeZone).toBe('UTC');
    expect(plan.day).toBe('2026-11-07');
    expect(plan.achievement?.roadmapId).toBe('roadmap');
  });
});
