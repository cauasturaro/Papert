import type { CalendarDay } from '../domain/calendar.js';
import type { Achievement } from '../domain/engagement.js';
import type { RoadmapStanding } from '../domain/roadmap-standing.js';
import type { RecentDay, StreakView } from '../domain/streak.js';

/** The learner's engagement as the service computed it for today. */
export type EngagementState = {
  timeZone: string;
  timeZoneSet: boolean;
  today: CalendarDay;
  streak: StreakView;
  recent: RecentDay[];
  achievements: Achievement[];
  roadmaps: RoadmapStanding[];
};

// Execution ids stay private; the badge links to its workspace.
export function achievementView(achievement: Achievement) {
  return {
    kind: achievement.kind,
    roadmapId: achievement.roadmapId,
    workspaceId: achievement.workspaceId,
    title: achievement.title,
    concepts: achievement.concepts,
    stepCount: achievement.stepCount,
    awardedAt: achievement.awardedAt,
  };
}

export function roadmapStandingView(standing: RoadmapStanding) {
  return {
    roadmapId: standing.roadmapId,
    workspaceId: standing.workspaceId,
    title: standing.title,
    completedSteps: standing.completedSteps,
    totalSteps: standing.totalSteps,
    completed: standing.completed,
    achieved: standing.achieved,
  };
}

/** The profile page and the study IDE read this same view. */
export function engagementView(state: EngagementState) {
  return {
    timeZone: state.timeZone,
    timeZoneSet: state.timeZoneSet,
    today: state.today,
    streak: { ...state.streak, recent: state.recent },
    achievements: state.achievements.map(achievementView),
    roadmaps: state.roadmaps.map(roadmapStandingView),
  };
}
