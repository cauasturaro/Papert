import type { Achievement, EvaluatedAnalysis } from './engagement.js';

export const ACHIEVEMENT_CONCEPTS = 12;

/**
 * The badge an analysis earns: only the approval that unlocked a roadmap's last step, as Study
 * recorded it. Seymour's evaluation never reaches this rule directly.
 */
export function roadmapAchievement(
  analysis: EvaluatedAnalysis,
): Achievement | null {
  const roadmap = analysis.completedRoadmap;

  if (!analysis.approved || !roadmap) {
    return null;
  }

  if (roadmap.workspaceId !== analysis.workspaceId) {
    return null;
  }

  const concepts = [...new Set(roadmap.concepts)].slice(
    0,
    ACHIEVEMENT_CONCEPTS,
  );

  return {
    kind: 'roadmap_completed',
    roadmapId: roadmap.roadmapId,
    workspaceId: roadmap.workspaceId,
    executionId: analysis.executionId,
    title: roadmap.title,
    concepts,
    stepCount: roadmap.stepCount,
    awardedAt: analysis.evaluatedAt,
  };
}
