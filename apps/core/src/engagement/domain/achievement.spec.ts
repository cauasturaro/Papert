import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_CONCEPTS, roadmapAchievement } from './achievement.js';

const completedRoadmap = {
  roadmapId: 'roadmap',
  workspaceId: 'workspace',
  title: 'Hexagonal APIs',
  stepCount: 3,
  concepts: ['ports', 'adapters', 'ports'],
};
const analysis = {
  userId: 'learner',
  executionId: 'execution',
  workspaceId: 'workspace',
  approved: true,
  evaluatedAt: new Date('2026-11-06T12:00:00Z'),
  completedRoadmap,
};

describe('Roadmap achievement', () => {
  it('is awarded for the approval that completed the roadmap', () => {
    const achievement = roadmapAchievement(analysis);

    expect(achievement).toEqual({
      kind: 'roadmap_completed',
      roadmapId: 'roadmap',
      workspaceId: 'workspace',
      executionId: 'execution',
      title: 'Hexagonal APIs',
      concepts: ['ports', 'adapters'],
      stepCount: 3,
      awardedAt: analysis.evaluatedAt,
    });
  });

  it.each([
    { ...analysis, completedRoadmap: null },
    { ...analysis, approved: false },
    { ...analysis, workspaceId: 'other' },
  ])('is not awarded without an official completion: %j', (input) => {
    expect(roadmapAchievement(input)).toBeNull();
  });

  it('keeps a bounded list of concepts', () => {
    const concepts = Array.from(
      { length: 20 },
      (_, index) => `concept-${index}`,
    );
    const wide = {
      ...analysis,
      completedRoadmap: { ...completedRoadmap, concepts },
    };

    const achievement = roadmapAchievement(wide);

    expect(achievement?.concepts).toHaveLength(ACHIEVEMENT_CONCEPTS);
  });
});
