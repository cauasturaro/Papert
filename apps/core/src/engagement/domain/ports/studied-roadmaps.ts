import type { RoadmapProgress } from '../engagement.js';

/** The learner's started roadmaps with their official progress, owned by Study. */
export interface StudiedRoadmaps {
  progressOf(userId: string): Promise<RoadmapProgress[]>;
}
