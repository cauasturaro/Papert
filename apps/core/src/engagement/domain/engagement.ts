import { DomainError } from '../../common/domain/domain-error.js';
import type { CalendarDay } from './calendar.js';

export class EngagementError extends DomainError {}

/** The streak counters stored on a learner's profile. */
export type StreakRecord = {
  currentStreak: number;
  longestStreak: number;
  lastStudyDay: CalendarDay | null;
};

export type LearnerProfile = StreakRecord & {
  userId: string;
  timeZone: string | null;
};

/** An analysis Core evaluated (approved or needs work), the event that makes a study day. */
export type EvaluatedAnalysis = {
  userId: string;
  executionId: string;
  workspaceId: string;
  approved: boolean;
  evaluatedAt: Date;
  // Set only when this approval unlocked the roadmap's last step.
  completedRoadmap: CompletedRoadmap | null;
};

export type CompletedRoadmap = {
  roadmapId: string;
  workspaceId: string;
  title: string;
  stepCount: number;
  concepts: string[];
};

export type AchievementKind = 'roadmap_completed';

export type Achievement = {
  kind: AchievementKind;
  roadmapId: string;
  workspaceId: string;
  executionId: string;
  title: string;
  concepts: string[];
  stepCount: number;
  awardedAt: Date;
};

/** A learner's roadmap and how far official progression went, read from Study. */
export type RoadmapProgress = {
  roadmapId: string;
  workspaceId: string;
  title: string;
  completedSteps: number;
  totalSteps: number;
};
