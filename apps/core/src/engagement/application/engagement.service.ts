import type { Clock } from '../../common/domain/runtime.js';
import { addDays, localDay } from '../domain/calendar.js';
import type { EngagementRepository } from '../domain/ports/engagement-repository.js';
import type { StudiedRoadmaps } from '../domain/ports/studied-roadmaps.js';
import {
  effectiveTimeZone,
  hasTimeZone,
  timeZoneChange,
} from '../domain/profile.js';
import { roadmapStandings } from '../domain/roadmap-standing.js';
import { RECENT_DAYS, recentDays, streakView } from '../domain/streak.js';
import { parse, timeZoneSchema } from './contracts/engagement.contract.js';
import { engagementView } from './engagement-presentation.js';

/** Streaks and achievements as Core recorded them; learners can only choose their time zone. */
export class EngagementService {
  constructor(
    private readonly engagement: EngagementRepository,
    private readonly roadmaps: StudiedRoadmaps,
    private readonly clock: Clock,
  ) {}

  async view(userId: string) {
    const profile = await this.engagement.profile(userId);

    const timeZone = effectiveTimeZone(profile);
    const today = localDay(this.clock(), timeZone);
    const from = addDays(today, 1 - RECENT_DAYS);

    const [studied, achievements, roadmaps] = await Promise.all([
      this.engagement.studyDays(userId, from),
      this.engagement.achievements(userId),
      this.roadmaps.progressOf(userId),
    ]);

    const state = {
      timeZone,
      timeZoneSet: hasTimeZone(profile),
      today,
      streak: streakView(profile, today),
      recent: recentDays(studied, today),
      achievements,
      roadmaps: roadmapStandings(roadmaps, achievements),
    };

    return engagementView(state);
  }

  async setTimeZone(userId: string, body: unknown) {
    const input = parse(timeZoneSchema, body);

    await this.engagement.writeTimeZone(
      userId,
      (current) => timeZoneChange(current, input),
      this.clock(),
    );

    return this.view(userId);
  }
}
