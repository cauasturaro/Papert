import { describe, expect, it } from 'vitest';
import { roadmapStandings } from './roadmap-standing.js';

const progress = (roadmapId: string, completedSteps: number) => ({
  roadmapId,
  workspaceId: `${roadmapId}-workspace`,
  title: roadmapId,
  completedSteps,
  totalSteps: 2,
});

describe('Roadmap standings', () => {
  it('marks completion from official progress and badges by roadmap', () => {
    const achievement = {
      kind: 'roadmap_completed' as const,
      roadmapId: 'done',
      workspaceId: 'done-workspace',
      executionId: 'execution',
      title: 'done',
      concepts: [],
      stepCount: 2,
      awardedAt: new Date('2026-11-06T12:00:00Z'),
    };

    const standings = roadmapStandings(
      [progress('started', 1), progress('done', 2), progress('earlier', 2)],
      [achievement],
    );

    expect(
      standings.map(({ roadmapId, completed, achieved }) => ({
        roadmapId,
        completed,
        achieved,
      })),
    ).toEqual([
      { roadmapId: 'started', completed: false, achieved: false },
      { roadmapId: 'done', completed: true, achieved: true },
      { roadmapId: 'earlier', completed: true, achieved: false },
    ]);
  });
});
