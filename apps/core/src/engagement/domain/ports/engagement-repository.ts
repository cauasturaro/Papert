import type { CalendarDay } from '../calendar.js';
import type { Achievement, LearnerProfile } from '../engagement.js';

export interface EngagementRepository {
  profile(userId: string): Promise<LearnerProfile | null>;
  // Study days on or after `from`, in any order.
  studyDays(userId: string, from: CalendarDay): Promise<CalendarDay[]>;
  achievements(userId: string): Promise<Achievement[]>;
  // Applies `change` to the locked profile (created when missing); null keeps the stored zone.
  writeTimeZone(
    userId: string,
    change: (current: LearnerProfile | null) => string | null,
    now: Date,
  ): Promise<LearnerProfile>;
}
