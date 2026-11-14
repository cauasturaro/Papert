import type { Achievement, RoadmapProgress } from './engagement.js';

/** A roadmap's official progress with whether it is finished and its badge was awarded. */
export type RoadmapStanding = RoadmapProgress & {
  completed: boolean;
  achieved: boolean;
};

export function roadmapStandings(
  roadmaps: RoadmapProgress[],
  achievements: Achievement[],
): RoadmapStanding[] {
  const achieved = new Set(achievements.map((item) => item.roadmapId));

  return roadmaps.map((roadmap) => ({
    ...roadmap,
    // `currentStep == steps.length` is the completed roadmap.
    completed: roadmap.completedSteps >= roadmap.totalSteps,
    achieved: achieved.has(roadmap.roadmapId),
  }));
}
