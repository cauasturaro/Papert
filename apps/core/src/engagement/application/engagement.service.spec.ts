import { describe, expect, it } from 'vitest';
import type { LearnerProfile } from '../domain/engagement.js';
import type { EngagementRepository } from '../domain/ports/engagement-repository.js';
import { EngagementService } from './engagement.service.js';

const now = new Date('2026-11-07T02:00:00Z');

function service(stored: LearnerProfile | null) {
  const writes: (string | null)[] = [];
  let profile = stored;

  const repository: EngagementRepository = {
    profile: () => Promise.resolve(profile),
    studyDays: (_userId, from) =>
      Promise.resolve(
        ['2026-11-05', '2026-11-06'].filter((day) => day >= from),
      ),
    achievements: () => Promise.resolve([]),
    writeTimeZone: (userId, change) => {
      const timeZone = change(profile);
      writes.push(timeZone);

      profile = {
        userId,
        currentStreak: profile?.currentStreak ?? 0,
        longestStreak: profile?.longestStreak ?? 0,
        lastStudyDay: profile?.lastStudyDay ?? null,
        timeZone: timeZone ?? profile?.timeZone ?? null,
      };

      return Promise.resolve(profile);
    },
  };
  const roadmaps = {
    progressOf: () =>
      Promise.resolve([
        {
          roadmapId: 'roadmap',
          workspaceId: 'workspace',
          title: 'Roadmap',
          completedSteps: 2,
          totalSteps: 2,
        },
      ]),
  };

  return {
    engagement: new EngagementService(repository, roadmaps, () => now),
    writes,
  };
}

describe('EngagementService', () => {
  it('dates today and the streak in the learner zone', async () => {
    const stored = {
      userId: 'learner',
      timeZone: 'America/Sao_Paulo',
      currentStreak: 2,
      longestStreak: 2,
      lastStudyDay: '2026-11-06',
    };
    const { engagement } = service(stored);

    const view = await engagement.view('learner');

    expect(view.today).toBe('2026-11-06');
    expect(view.streak).toMatchObject({ current: 2, status: 'studied' });
    expect(view.streak.recent.slice(-2)).toEqual([
      { day: '2026-11-05', studied: true },
      { day: '2026-11-06', studied: true },
    ]);
    expect(view.roadmaps[0]).toMatchObject({
      completed: true,
      achieved: false,
    });
  });

  it('falls back to UTC and accepts the detected browser zone once', async () => {
    const { engagement, writes } = service(null);

    const before = await engagement.view('learner');
    const detected = await engagement.setTimeZone('learner', {
      timeZone: 'America/Sao_Paulo',
      detected: true,
    });
    const again = await engagement.setTimeZone('learner', {
      timeZone: 'Europe/Lisbon',
      detected: true,
    });

    expect(before).toMatchObject({
      timeZone: 'UTC',
      timeZoneSet: false,
      today: '2026-11-07',
    });
    expect(detected).toMatchObject({
      timeZone: 'America/Sao_Paulo',
      timeZoneSet: true,
    });
    expect(again.timeZone).toBe('America/Sao_Paulo');
    expect(writes).toEqual(['America/Sao_Paulo', null]);
  });

  it.each([
    { timeZone: '+03:00' },
    { timeZone: 'Mars/Olympus' },
    { timeZone: 'UTC', currentStreak: 30 },
  ])('rejects an invalid or tampered request: %j', async (body) => {
    const { engagement } = service(null);

    await expect(engagement.setTimeZone('learner', body)).rejects.toMatchObject(
      {
        kind: 'invalid',
      },
    );
  });
});
