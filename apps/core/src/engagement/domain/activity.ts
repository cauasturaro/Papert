import { roadmapAchievement } from './achievement.js';
import type { CalendarDay } from './calendar.js';
import type {
  Achievement,
  EvaluatedAnalysis,
  LearnerProfile,
  StreakRecord,
} from './engagement.js';
import { effectiveTimeZone } from './profile.js';
import { activityDay, studyDayChange } from './streak.js';

/** Everything one evaluated analysis changes for its learner. */
export type ActivityPlan = {
  day: CalendarDay;
  // The zone that dated the day; stored with it so later zone changes never rewrite it.
  timeZone: string;
  // Null when the day was already counted and the counters stay as they are.
  streak: StreakRecord | null;
  achievement: Achievement | null;
};

export function analysisActivity(
  profile: LearnerProfile,
  analysis: EvaluatedAnalysis,
): ActivityPlan {
  const timeZone = effectiveTimeZone(profile);
  const day = activityDay(analysis.evaluatedAt, timeZone, profile);
  const change = studyDayChange(profile, day);

  return {
    day: change.day,
    timeZone,
    streak: change.newDay ? change.streak : null,
    achievement: roadmapAchievement(analysis),
  };
}
